import { expect, test } from "@playwright/test";

import { apiContextFor, loginViaApi } from "../../fixtures/api-client.js";
import { cleanupThrowawayTenant, provisionThrowawayTenant, setTenantPlanTier, type ThrowawayTenant } from "../../fixtures/throwaway-tenant.js";

// Regression test for a real backend authorization gap found this session:
// the plan-tier module ceiling (Silver excludes every toggleable module,
// see PLAN_LIMITS.silver.modules = [] in plan-catalog.ts) used to be
// enforced ONLY by the read-only GET /module-settings endpoint the
// frontend nav consults -- none of the actual feature controllers checked
// it, so a Silver-tier tenant's super_admin (who holds every RBAC
// permission) could still fully use library/transport/houses/payroll/
// expenses/leave via direct API calls. Closed by ModuleAccessGuard +
// @RequireModule (see src/common/module-access.guard.ts).
//
// Each entry hits one representative, permission-satisfied GET endpoint
// per gated module -- enough to prove the guard is wired on that
// controller, not an exhaustive sweep of every route.
const GATED_ENDPOINTS: { module: string; path: string }[] = [
  { module: "library", path: "library/books" },
  { module: "transport", path: "transport/routes" },
  { module: "houses", path: "houses" },
  { module: "payroll", path: "payroll-runs" },
  { module: "expenses", path: "expenses" },
  { module: "leave", path: "staff-leave" },
];

let throwaway: ThrowawayTenant;

test.beforeAll(async () => {
  throwaway = await provisionThrowawayTenant("silver");
});

test.afterAll(async () => {
  await cleanupThrowawayTenant(throwaway.tenantId);
});

for (const { module, path } of GATED_ENDPOINTS) {
  test(`Silver-tier tenant is blocked from ${module} via direct API call, despite holding the RBAC permission`, async () => {
    const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
    const api = await apiContextFor(auth.accessToken);

    const res = await api.get(path);

    expect(res.status()).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("This module is not available on your school's plan.");
    await api.dispose();
  });
}

test("upgrading the tenant to Gold immediately unblocks every gated module, with no re-login required", async () => {
  await setTenantPlanTier(throwaway.tenantId, "gold");

  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);

  for (const { path } of GATED_ENDPOINTS) {
    const res = await api.get(path);
    expect(res.ok()).toBe(true);
  }
  await api.dispose();

  // Restore Silver so any other test in this file (run order notwithstanding)
  // still sees the tier it expects.
  await setTenantPlanTier(throwaway.tenantId, "silver");
});

test("branches (not a toggleable module) is never gated, regardless of plan tier", async () => {
  const auth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const api = await apiContextFor(auth.accessToken);

  const res = await api.get("branches");

  expect(res.ok()).toBe(true);
  await api.dispose();
});
