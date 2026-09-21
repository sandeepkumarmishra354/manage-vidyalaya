import { expect, test } from "@playwright/test";

import {
  apiContextFor,
  createTestStaff,
  createTestStudent,
  getBranchIdByName,
  getCurrentAcademicSessionId,
  loginViaApi,
  relieveTestStaff,
} from "../../fixtures/api-client.js";
import { bulkInsertActiveStaff, bulkInsertEnrolledStudents } from "../../fixtures/plan-seed.js";
import { cleanupThrowawayTenant, provisionThrowawayTenant, type ThrowawayTenant } from "../../fixtures/throwaway-tenant.js";

// Regression coverage for two real backend bugs found this session:
//
// - StaffService.setStaffStatus let any status transition through with no
//   max_staff re-check, so a staff member already at the plan's limit could
//   free up "capacity" by relieving one staff member, then reactivate a
//   DIFFERENT already-relieved staff member -- ending up back over the
//   limit despite the guard existing on the *creation* path.
// - StudentsService.updateStudent let dto.status be set straight to
//   'enrolled' with no max_students re-check, bypassing confirmAdmission's
//   check entirely the same way.
//
// Both are fixed by re-running the same limit check inside the relevant
// service method whenever the transition crosses back into the counted set
// (see PlanLimitsService.assertUnderLimit call sites in
// staff.service.ts#setStaffStatus and students.service.ts#updateStudent).

let throwaway: ThrowawayTenant;
let branchId: string;

test.beforeAll(async () => {
  throwaway = await provisionThrowawayTenant("silver");
  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);
  branchId = await getBranchIdByName(api, "Main Branch");
  await api.dispose();
});

test.afterAll(async () => {
  await cleanupThrowawayTenant(throwaway.tenantId);
});

test("staff un-relieve: reactivating a different relieved staff member is rejected once back at the max_staff limit", async () => {
  // Seed 29 active + 1 already-relieved staff member via bulk insert, then
  // create one more active staff member through the real API to land
  // exactly at the 30-staff limit (createStaff's own max_staff check must
  // allow this, since relieved staff aren't counted).
  await bulkInsertActiveStaff(throwaway.tenantId, branchId, 29);

  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);

  const relievedStaffId = await createTestStaff(api, { branchId, firstName: `ToBeRelieved${Date.now()}` });
  await relieveTestStaff(api, relievedStaffId);

  const thirtiethStaffId = await createTestStaff(api, { branchId, firstName: `ThirtiethStaff${Date.now()}` });
  expect(thirtiethStaffId).toBeTruthy();

  // Now at exactly 30 active staff (29 bulk + the 30th just created), plus
  // 1 relieved staff member sitting outside the counted set. Reactivating
  // that relieved staff member must be rejected -- it would bring the
  // active count to 31.
  const res = await api.post(`staff/${relievedStaffId}/status`, {
    data: { status: "active" },
  });

  expect(res.status()).toBe(403);
  const body = (await res.json()) as { message: string };
  expect(body.message).toBe("This school's plan allows at most that many staff members.");

  // The relieved staff member must still be genuinely relieved (rejected
  // transaction rolled back cleanly, not left in some half-applied state).
  const getRes = await api.get(`staff?branch_id=${branchId}`);
  const staffList = (await getRes.json()) as { id: string; status: string }[];
  const stillRelieved = staffList.find((s) => s.id === relievedStaffId);
  expect(stillRelieved?.status).toBe("relieved");

  await api.dispose();
});

test("staff reactivation is allowed when it does not cross back into the counted set", async () => {
  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);

  // The tenant is already at the 30-staff limit from the previous test, so
  // this reuses one of the already-active bulk-seeded staff members rather
  // than creating a new one (which would itself be rejected by max_staff --
  // a different, already-covered check).
  const listRes = await api.get(`staff?branch_id=${branchId}`);
  const staffList = (await listRes.json()) as { id: string; status: string }[];
  const activeStaff = staffList.find((s) => s.status === "active");
  expect(activeStaff).toBeTruthy();
  const staffId = activeStaff!.id;

  // active -> on_leave -> active is a transition entirely within the
  // counted set (status != 'relieved' both before and after), so it must
  // never be blocked by the max_staff check regardless of how close to the
  // limit the tenant is.
  const toLeave = await api.post(`staff/${staffId}/status`, { data: { status: "on_leave" } });
  expect(toLeave.ok()).toBe(true);

  const backToActive = await api.post(`staff/${staffId}/status`, { data: { status: "active" } });
  expect(backToActive.ok()).toBe(true);

  await api.dispose();
});

test("student re-enrollment: setting a different withdrawn student back to enrolled is rejected once back at the max_students limit", async () => {
  await bulkInsertEnrolledStudents(throwaway.tenantId, branchId, 299);

  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);
  const academicSessionId = await getCurrentAcademicSessionId(api);

  // Create and confirm one more student to land exactly at 300 enrolled,
  // and a second student who gets confirmed then withdrawn (frees a
  // "slot" only in the sense of no longer being counted).
  const studentIdAtLimit = await createTestStudent(api, {
    branchId,
    academicSessionId,
    firstName: `ThreeHundredth${Date.now()}`,
  });
  const admissionAtLimitRes = await api.get(`admissions/student/${studentIdAtLimit}`);
  const { id: admissionAtLimitId } = (await admissionAtLimitRes.json()) as { id: string };
  const confirmAtLimit = await api.post(`admissions/${admissionAtLimitId}/confirm`);
  expect(confirmAtLimit.ok()).toBe(true);

  const withdrawnStudentId = await createTestStudent(api, {
    branchId,
    academicSessionId,
    firstName: `ToBeWithdrawn${Date.now()}`,
  });
  const withdrawnAdmissionRes = await api.get(`admissions/student/${withdrawnStudentId}`);
  const { id: withdrawnAdmissionId } = (await withdrawnAdmissionRes.json()) as { id: string };
  // This confirm happens while already at 300 (grandfathered pre-seed) +
  // the ThreeHundredth student just confirmed above = 301, so it may
  // itself be rejected by max_students. Withdraw the underlying student
  // row directly instead of relying on confirm succeeding, so this test
  // only exercises the re-enrollment bypass, not confirmAdmission's own
  // (already-covered) check.
  await api.patch(`students/${withdrawnStudentId}`, {
    data: { first_name: `ToBeWithdrawn`, status: "withdrawn" },
  });

  // Now at exactly 300 enrolled students, with one withdrawn student sitting
  // outside the counted set. Setting that withdrawn student back to
  // 'enrolled' must be rejected -- it would bring the enrolled count to 301.
  const res = await api.patch(`students/${withdrawnStudentId}`, {
    data: { first_name: "ToBeWithdrawn", status: "enrolled" },
  });

  expect(res.status()).toBe(403);
  const body = (await res.json()) as { message: string };
  expect(body.message).toBe("This school's plan allows at most that many enrolled students.");

  const getRes = await api.get(`students/${withdrawnStudentId}`);
  const student = (await getRes.json()) as { status: string };
  expect(student.status).toBe("withdrawn");

  await api.dispose();
});

test("student status change is allowed when it does not cross back into the enrolled set", async () => {
  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);
  const academicSessionId = await getCurrentAcademicSessionId(api);

  const studentId = await createTestStudent(api, {
    branchId,
    academicSessionId,
    firstName: `NonEnrolledTransition${Date.now()}`,
  });

  // Still in "applied" status (never confirmed) -- moving it to 'withdrawn'
  // never touches the enrolled set on either side of the transition, so it
  // must never be blocked by max_students regardless of how close to the
  // limit the tenant is.
  const res = await api.patch(`students/${studentId}`, {
    data: { first_name: "NonEnrolledTransition", status: "withdrawn" },
  });
  expect(res.ok()).toBe(true);

  await api.dispose();
});
