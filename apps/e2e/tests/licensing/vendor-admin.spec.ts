import { expect, request, test } from "@playwright/test";

import { API_BASE_URL } from "../../fixtures/api-url.js";
import { loginViaApi } from "../../fixtures/api-client.js";
import { PERSONAS } from "../../fixtures/personas.js";
import { cleanupThrowawayTenant } from "../../fixtures/throwaway-tenant.js";
import { VENDOR_API_BASE_URL } from "../../fixtures/vendor-api-url.js";
import { cleanupThrowawayVendorAdmin, provisionThrowawayVendorAdmin, type ThrowawayVendorAdmin } from "../../fixtures/vendor-admin.js";

const VENDOR_WEB_URL = process.env.E2E_VENDOR_WEB_URL ?? "http://localhost:5175";

test.describe("vendor-admin-web tenant management", () => {
  let vendorAdmin: ThrowawayVendorAdmin;
  let createdTenantId: string | undefined;

  test.beforeAll(async () => {
    vendorAdmin = await provisionThrowawayVendorAdmin();
  });

  test.afterAll(async () => {
    if (createdTenantId) await cleanupThrowawayTenant(createdTenantId);
    await cleanupThrowawayVendorAdmin(vendorAdmin.email);
  });

  test("a vendor operator can log in, create a tenant, and suspending it immediately blocks that tenant's login on cloud-api", async ({
    page,
  }) => {
    await page.goto(VENDOR_WEB_URL);

    await page.getByLabel("Email").fill(vendorAdmin.email);
    await page.getByLabel("Password").fill(vendorAdmin.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("link", { name: "+ New tenant" })).toBeVisible();

    await page.getByRole("link", { name: "+ New tenant" }).click();

    const suffix = Date.now();
    const subdomain = `e2e-vendor-created-${suffix}`;
    const adminEmail = `admin@${subdomain}.example`;
    const adminPassword = "vidyalaya-e2e-vendor-created-tenant";

    await page.locator("#school_name").fill(`E2E Vendor-Created School ${suffix}`);
    await page.locator("#subdomain").fill(subdomain);
    await page.locator("#branch_name").fill("Main Branch");
    await page.locator("#branch_code").fill("MAIN");
    await page.locator("#plan_tier").selectOption("gold");
    await page.locator("#admin_name").fill("E2E Vendor Created Admin");
    await page.locator("#admin_email").fill(adminEmail);
    await page.locator("#admin_password").fill(adminPassword);

    await page.getByRole("button", { name: "Create tenant" }).click();

    await expect(page.getByRole("heading", { name: "Tenant created" })).toBeVisible();

    // The newly created tenant logs in fine on cloud-api before any
    // suspension -- confirms the tenant this test suspends below really is
    // usable first, not just present in vendor-admin-api's own database.
    const preSuspendLogin = await loginViaApi(adminEmail, adminPassword);
    expect(preSuspendLogin.accessToken).toBeTruthy();
    createdTenantId = preSuspendLogin.tenantId;

    await page.getByRole("button", { name: "View tenant" }).click();
    await expect(page.getByRole("heading", { name: `E2E Vendor-Created School ${suffix}` })).toBeVisible();

    await page.getByLabel("Suspended").check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    // Confirm the suspension took effect on cloud-api's side -- this is
    // the actual cross-service integration point being tested: a write
    // through vendor-admin-web/api immediately affects
    // PlanLimitsService.assertTenantActive's login gate in the completely
    // separate cloud-api service, with no re-deploy or cache to wait out.
    const context = await request.newContext({ baseURL: API_BASE_URL });
    const res = await context.post("auth/login", { data: { email: adminEmail, password: adminPassword } });
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("Your school's account has been suspended. Contact your administrator.");
    await context.dispose();
  });
});

test.describe("cross-service JWT isolation", () => {
  // cloud-api and vendor-admin-api are two separate NestJS services signing
  // with two separate secrets (JWT_SECRET vs VENDOR_JWT_SECRET -- see
  // vendor-admin-api's jwt.strategy.ts comment) and neither token carries an
  // aud/iss claim as a second layer of defense. This documents/guards that
  // a token from one service is never accepted by the other's guard.
  test("a cloud-api tenant-user access token is rejected by vendor-admin-api's /auth/me", async () => {
    const tenantLogin = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
    const vendorContext = await request.newContext({
      baseURL: VENDOR_API_BASE_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${tenantLogin.accessToken}` },
    });
    const res = await vendorContext.get("auth/me");
    expect(res.status()).toBe(401);
    await vendorContext.dispose();
  });

  test("a vendor-admin-api operator access token is rejected by cloud-api's /auth/me", async () => {
    const vendorAdmin = await provisionThrowawayVendorAdmin();
    try {
      const vendorLoginContext = await request.newContext({ baseURL: VENDOR_API_BASE_URL });
      const loginRes = await vendorLoginContext.post("auth/login", {
        data: { email: vendorAdmin.email, password: vendorAdmin.password },
      });
      expect(loginRes.ok()).toBe(true);
      const { access_token } = (await loginRes.json()) as { access_token: string };
      await vendorLoginContext.dispose();

      const cloudContext = await request.newContext({
        baseURL: API_BASE_URL,
        extraHTTPHeaders: { Authorization: `Bearer ${access_token}` },
      });
      const res = await cloudContext.get("auth/me");
      expect(res.status()).toBe(401);
      await cloudContext.dispose();
    } finally {
      await cleanupThrowawayVendorAdmin(vendorAdmin.email);
    }
  });
});
