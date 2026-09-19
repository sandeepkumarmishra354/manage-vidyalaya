import { expect, test } from "@playwright/test";

import { apiContextFor, createTestStudent, getBranchIdByName, getCurrentAcademicSessionId, loginViaApi } from "../../fixtures/api-client.js";
import { PERSONAS } from "../../fixtures/personas.js";
import { cleanupThrowawayTenant, provisionThrowawayTenant, type ThrowawayTenant } from "../../fixtures/throwaway-tenant.js";

// The direct regression test for the class of bug the Row-Level Security
// work in this codebase's history exists to prevent: a genuinely separate
// tenant's user must never be able to read another school's data, even
// when handed that data's real id directly. Provisions a real throwaway
// tenant via the same script a real school onboarding uses
// (create-tenant.ts), rather than faking tenant separation.

let throwaway: ThrowawayTenant;

test.beforeAll(async () => {
  throwaway = await provisionThrowawayTenant();
});

test.afterAll(async () => {
  await cleanupThrowawayTenant(throwaway.tenantId);
});

test("a throwaway tenant's admin cannot read the demo tenant's data by id", async () => {
  const suffix = Date.now();
  const demoAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const demoApi = await apiContextFor(demoAuth.accessToken);
  const demoBranchId = await getBranchIdByName(demoApi, "North Campus");
  const demoSessionId = await getCurrentAcademicSessionId(demoApi);

  // Create our own real row rather than assuming the demo tenant already
  // has students -- a fresh seed (e.g. CI's from-scratch database) has
  // none, and this test's job is cross-tenant isolation, not "the demo
  // tenant happens to have data".
  const realDemoStudentId = await createTestStudent(demoApi, {
    branchId: demoBranchId,
    academicSessionId: demoSessionId,
    firstName: `E2ETenantIsolation${suffix}`,
  });
  await demoApi.dispose();

  const throwawayAuth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  expect(throwawayAuth.tenantId).not.toBe(demoAuth.tenantId);
  const throwawayApi = await apiContextFor(throwawayAuth.accessToken);

  const crossTenantRes = await throwawayApi.get(`students/${realDemoStudentId}`);
  expect(crossTenantRes.status()).toBe(404);
  await throwawayApi.dispose();
});

test("a throwaway tenant's admin cannot list the demo tenant's branches by id", async () => {
  const demoAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const demoApi = await apiContextFor(demoAuth.accessToken);
  const demoBranchId = await getBranchIdByName(demoApi, "Main Campus");
  await demoApi.dispose();

  const throwawayAuth = await loginViaApi(throwaway.adminEmail, throwaway.adminPassword);
  const throwawayApi = await apiContextFor(throwawayAuth.accessToken);

  const branchesRes = await throwawayApi.get("branches");
  expect(branchesRes.ok()).toBe(true);
  const throwawayBranches = (await branchesRes.json()) as { id: string }[];
  expect(throwawayBranches.some((b) => b.id === demoBranchId)).toBe(false);
  await throwawayApi.dispose();
});
