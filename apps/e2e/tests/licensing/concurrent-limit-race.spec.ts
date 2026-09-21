import { expect, test } from "@playwright/test";

import { apiContextFor, getBranchIdByName, loginViaApi } from "../../fixtures/api-client.js";
import { bulkInsertActiveStaff } from "../../fixtures/plan-seed.js";
import { cleanupThrowawayTenant, provisionThrowawayTenant, type ThrowawayTenant } from "../../fixtures/throwaway-tenant.js";

// Regression test for a real TOCTOU bug found this session: createStaff (and
// createBranch/confirmAdmission/assignUserRole) used to run their max_staff
// count query in its own, separate transaction (via DbService.query, which
// opens and commits its own withTransaction) before a SEPARATE transaction
// did the insert -- no locking between the two. Under Postgres's default
// READ COMMITTED isolation, N concurrent requests hitting exactly
// limit-1-remaining capacity could all read the same pre-insert count and
// all pass the check, landing the tenant well over its plan's limit.
//
// Fixed by DbService.withTenantLock -- a transaction-scoped Postgres
// advisory lock (pg_advisory_xact_lock) acquired as the very first
// statement, serializing the count-then-insert for a given tenant+resource
// so only one concurrent request can ever observe capacity and take it.
//
// max_staff (Silver limit: 30) is used here because POST /staff is a
// single call (unlike admissions, which needs a separate create+confirm
// step) -- the simplest resource to fire a genuine burst of concurrent
// requests against.

let throwaway: ThrowawayTenant;
let branchId: string;

test.beforeAll(async () => {
  throwaway = await provisionThrowawayTenant("silver");
  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);
  branchId = await getBranchIdByName(api, "Main Branch");
  await api.dispose();

  // Land exactly 1 slot short of the 30-staff limit.
  await bulkInsertActiveStaff(throwaway.tenantId, branchId, 29);
});

test.afterAll(async () => {
  await cleanupThrowawayTenant(throwaway.tenantId);
});

test("firing concurrent staff creations at exactly 1 remaining slot allows exactly one to succeed", async () => {
  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);

  const CONCURRENCY = 8;
  const responses = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      api.post("staff", {
        data: {
          branch_id: branchId,
          first_name: `RaceStaff${i}-${Date.now()}`,
          designation: "E2E Test Staff",
          employment_type: "full_time",
          date_of_joining: new Date().toISOString().slice(0, 10),
          consent_given: true,
        },
      }),
    ),
  );

  const succeeded = responses.filter((r) => r.status() === 201);
  const rejected = responses.filter((r) => r.status() === 403);

  expect(succeeded.length).toBe(1);
  expect(rejected.length).toBe(CONCURRENCY - 1);

  for (const res of rejected) {
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("This school's plan allows at most that many staff members.");
  }

  // Confirm the actual persisted count matches -- exactly 30 active staff,
  // not 30 + (CONCURRENCY - 1) from a race that let extras slip through.
  const listRes = await api.get(`staff?branch_id=${branchId}`);
  const staffList = (await listRes.json()) as { status: string }[];
  const activeCount = staffList.filter((s) => s.status !== "relieved").length;
  expect(activeCount).toBe(30);

  await api.dispose();
});
