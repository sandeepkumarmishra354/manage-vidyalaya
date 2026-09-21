import { expect, test } from "@playwright/test";

import { apiContextFor, createTestStudent, getBranchIdByName, getCurrentAcademicSessionId, loginViaApi } from "../../fixtures/api-client.js";
import { bulkInsertActiveStaff, bulkInsertEnrolledStudents } from "../../fixtures/plan-seed.js";
import { cleanupThrowawayTenant, provisionThrowawayTenant, type ThrowawayTenant } from "../../fixtures/throwaway-tenant.js";

// Regression coverage for PlanLimitsService.assertUnderLimit's 5 checks,
// on a real Silver-tier tenant (max_branches:1, max_super_admins:1,
// max_branch_admins:2, max_students:300, max_staff:30 -- see
// plan-catalog.ts). Each check is exercised at exactly N+1 to confirm a
// clean rejection with the plan's own message, and existing/grandfathered
// data is confirmed to stay fully readable/usable.

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

test("max_branches: rejects creating a 2nd branch once already at the plan's 1-branch limit", async () => {
  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);

  const res = await api.post("branches", { data: { name: "Second Campus", code: "SECOND" } });

  expect(res.status()).toBe(403);
  const body = (await res.json()) as { message: string };
  expect(body.message).toBe("This school's plan allows at most that many branches.");
  await api.dispose();
});

test("max_super_admins: rejects granting a 2nd super_admin once already at the plan's 1-admin limit", async () => {
  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);

  const rolesRes = await api.get("roles");
  const roles = (await rolesRes.json()) as { id: string; name: string }[];
  const superAdminRoleId = roles.find((r) => r.name === "super_admin")?.id;
  expect(superAdminRoleId).toBeTruthy();

  const userRes = await api.post("users", {
    data: {
      tenant_id: throwaway.tenantId,
      branch_id: branchId,
      full_name: "Would-be Second Super Admin",
      email: `second-super-admin-${Date.now()}@example.com`,
      password: "verysecurepassword",
    },
  });
  expect(userRes.ok()).toBe(true);
  const { id: newUserId } = (await userRes.json()) as { id: string };

  const assignRes = await api.post(`users/${newUserId}/roles`, { data: { role_id: superAdminRoleId } });

  expect(assignRes.status()).toBe(403);
  const body = (await assignRes.json()) as { message: string };
  expect(body.message).toContain("super admin");
  await api.dispose();
});

test("max_branch_admins: allows up to 2, rejects the 3rd", async () => {
  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);

  const rolesRes = await api.get("roles");
  const roles = (await rolesRes.json()) as { id: string; name: string }[];
  const branchAdminRoleId = roles.find((r) => r.name === "branch_admin")?.id;
  expect(branchAdminRoleId).toBeTruthy();

  async function createBranchAdmin(label: string) {
    const userRes = await api.post("users", {
      data: {
        tenant_id: throwaway.tenantId,
        branch_id: branchId,
        full_name: `Branch Admin ${label}`,
        email: `branch-admin-${label}-${Date.now()}@example.com`,
        password: "verysecurepassword",
      },
    });
    expect(userRes.ok()).toBe(true);
    const { id } = (await userRes.json()) as { id: string };
    return api.post(`users/${id}/roles`, { data: { role_id: branchAdminRoleId } });
  }

  const first = await createBranchAdmin("1");
  expect(first.ok()).toBe(true);
  const second = await createBranchAdmin("2");
  expect(second.ok()).toBe(true);

  const third = await createBranchAdmin("3");
  expect(third.status()).toBe(403);
  const body = (await third.json()) as { message: string };
  expect(body.message).toContain("branch admin");
  await api.dispose();
});

test("max_students: rejects confirming an admission once already at the plan's 300-student limit, while existing enrolled students stay readable", async () => {
  await bulkInsertEnrolledStudents(throwaway.tenantId, branchId, 300);

  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);

  // Grandfathering: the 300 bulk-seeded rows must still be fully readable.
  const listRes = await api.get(`students?branch_id=${branchId}`);
  expect(listRes.ok()).toBe(true);
  const students = (await listRes.json()) as unknown[];
  expect(students.length).toBeGreaterThanOrEqual(300);

  const academicSessionId = await getCurrentAcademicSessionId(api);
  const studentId = await createTestStudent(api, {
    branchId,
    academicSessionId,
    firstName: `OverLimit${Date.now()}`,
  });
  const admissionRes = await api.get(`admissions/student/${studentId}`);
  expect(admissionRes.ok()).toBe(true);
  const { id: admissionId } = (await admissionRes.json()) as { id: string };

  const confirmRes = await api.post(`admissions/${admissionId}/confirm`);

  expect(confirmRes.status()).toBe(403);
  const body = (await confirmRes.json()) as { message: string };
  expect(body.message).toBe("This school's plan allows at most that many enrolled students.");
  await api.dispose();
});

test("max_staff: rejects creating a new staff member once already at the plan's 30-staff limit, while existing staff stay readable", async () => {
  await bulkInsertActiveStaff(throwaway.tenantId, branchId, 30);

  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);

  const listRes = await api.get(`staff?branch_id=${branchId}`);
  expect(listRes.ok()).toBe(true);
  const staff = (await listRes.json()) as unknown[];
  expect(staff.length).toBeGreaterThanOrEqual(30);

  const res = await api.post("staff", {
    data: {
      branch_id: branchId,
      first_name: `OverLimitStaff${Date.now()}`,
      designation: "E2E Test Staff",
      employment_type: "full_time",
      date_of_joining: new Date().toISOString().slice(0, 10),
      consent_given: true,
    },
  });

  expect(res.status()).toBe(403);
  const body = (await res.json()) as { message: string };
  expect(body.message).toBe("This school's plan allows at most that many staff members.");
  await api.dispose();
});
