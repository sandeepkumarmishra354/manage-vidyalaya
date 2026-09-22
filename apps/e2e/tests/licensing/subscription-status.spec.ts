import { expect, request, test } from "@playwright/test";

import { API_BASE_URL } from "../../fixtures/api-url.js";
import { apiContextFor, loginViaApi } from "../../fixtures/api-client.js";
import {
  cleanupThrowawayTenant,
  provisionThrowawayTenant,
  setTenantSubscriptionStatus,
  type ThrowawayTenant,
} from "../../fixtures/throwaway-tenant.js";

// Regression coverage for PlanLimitsService.assertTenantActive: a suspended
// tenant or one past its trial/subscription expiry must be blocked both at
// login (called by AuthService.login/refresh) and, per JwtStrategy.validate,
// on every subsequent authenticated request for a session that was already
// live when the tenant was suspended/expired -- while a tenant with
// trial_ends_at/subscription_expires_at both NULL (the "grandfathered"
// state -- either a pre-plan-tier-migration tenant, or any non-trial tenant
// today, since create-tenant.ts only ever sets trial_ends_at for the trial
// tier) is never blocked.

async function attemptLogin(email: string, password: string) {
  const context = await request.newContext({ baseURL: API_BASE_URL });
  try {
    const res = await context.post("auth/login", { data: { email, password } });
    const body = (await res.json()) as { message: string };
    return { status: res.status(), message: body.message };
  } finally {
    await context.dispose();
  }
}

test.describe("subscription-status login gate", () => {
  let tenant: ThrowawayTenant;

  test.afterEach(async () => {
    if (tenant) await cleanupThrowawayTenant(tenant.tenantId);
  });

  test("a trial tenant past trial_ends_at is blocked at login with the trial-expired message", async () => {
    tenant = await provisionThrowawayTenant("trial");
    await setTenantSubscriptionStatus(tenant.tenantId, { trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });

    const { status, message } = await attemptLogin(tenant.adminEmail, tenant.adminPassword);

    expect(status).toBe(401);
    expect(message).toBe("Your school's trial period has ended. Contact your administrator to choose a plan.");
  });

  test("a suspended tenant is blocked at login with the suspension message, regardless of plan tier", async () => {
    tenant = await provisionThrowawayTenant("gold");
    await setTenantSubscriptionStatus(tenant.tenantId, { isSuspended: true });

    const { status, message } = await attemptLogin(tenant.adminEmail, tenant.adminPassword);

    expect(status).toBe(401);
    expect(message).toBe("Your school's account has been suspended. Contact your administrator.");
  });

  test("a non-trial tenant past a manually-set subscription_expires_at is blocked at login", async () => {
    tenant = await provisionThrowawayTenant("silver");
    await setTenantSubscriptionStatus(tenant.tenantId, {
      subscriptionExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const { status, message } = await attemptLogin(tenant.adminEmail, tenant.adminPassword);

    expect(status).toBe(401);
    expect(message).toBe("Your school's subscription has expired. Contact your administrator to renew.");
  });

  test("a grandfathered tenant (trial_ends_at and subscription_expires_at both NULL) is never blocked", async () => {
    tenant = await provisionThrowawayTenant("gold");
    // create-tenant.ts never sets subscription_expires_at, and only sets
    // trial_ends_at for the trial tier -- a freshly-provisioned Gold tenant
    // is already in the grandfathered NULL/NULL state, but set both
    // explicitly to make the scenario unambiguous regardless of that.
    await setTenantSubscriptionStatus(tenant.tenantId, { trialEndsAt: null, subscriptionExpiresAt: null });

    const login = await loginViaApi(tenant.adminEmail, tenant.adminPassword);
    expect(login.accessToken).toBeTruthy();
  });

  test("a trial tenant still within trial_ends_at logs in normally", async () => {
    tenant = await provisionThrowawayTenant("trial");

    const login = await loginViaApi(tenant.adminEmail, tenant.adminPassword);
    expect(login.accessToken).toBeTruthy();
  });

  // Regression coverage for JwtStrategy.validate() re-checking
  // assertTenantActive on every request (not just login/refresh): a user
  // who was already logged in before the tenant was suspended/expired must
  // be locked out on their very next authenticated call, reusing the same
  // still-unexpired access token -- not just blocked the next time they
  // try to log in again.
  test("a still-valid access token stops working the moment its tenant is suspended mid-session", async () => {
    tenant = await provisionThrowawayTenant("gold");
    const login = await loginViaApi(tenant.adminEmail, tenant.adminPassword);

    const api = await apiContextFor(login.accessToken);
    try {
      const before = await api.get("auth/me");
      expect(before.ok()).toBe(true);

      await setTenantSubscriptionStatus(tenant.tenantId, { isSuspended: true });

      const after = await api.get("auth/me");
      expect(after.status()).toBe(401);
    } finally {
      await api.dispose();
    }
  });

  test("a still-valid access token stops working the moment its trial expires mid-session", async () => {
    tenant = await provisionThrowawayTenant("trial");
    const login = await loginViaApi(tenant.adminEmail, tenant.adminPassword);

    const api = await apiContextFor(login.accessToken);
    try {
      const before = await api.get("auth/me");
      expect(before.ok()).toBe(true);

      await setTenantSubscriptionStatus(tenant.tenantId, { trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });

      const after = await api.get("auth/me");
      expect(after.status()).toBe(401);
    } finally {
      await api.dispose();
    }
  });
});
