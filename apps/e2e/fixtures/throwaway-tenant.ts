import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://vidyalaya:vidyalaya@localhost:5432/vidyalaya";

export interface ThrowawayTenant {
  tenantId: string;
  adminEmail: string;
  adminPassword: string;
}

// Provisions a genuinely separate tenant via the same script a real school
// onboarding uses (apps/cloud-api/scripts/create-tenant.ts) -- this is the
// "throwaway tenant/branch/row" technique already used earlier in this
// codebase's history to verify the RLS fee-isolation fix, reused here as a
// permanent, repeatable test instead of a one-off manual check.
//
// planTier defaults to "trial" (create-tenant.ts's own default, full
// Gold-tier access for TRIAL_PERIOD_DAYS) -- pass "silver"/"gold"
// explicitly for licensing tests that need a specific tier's ceiling.
export async function provisionThrowawayTenant(planTier?: "trial" | "silver" | "gold"): Promise<ThrowawayTenant> {
  const suffix = Date.now();
  const subdomain = `e2e-isolation-${suffix}`;
  const adminEmail = `admin@${subdomain}.example`;

  const { stdout } = await execFileAsync(
    "pnpm",
    [
      "--filter",
      "cloud-api",
      "create-tenant",
      `--school-name=E2E Isolation Test ${suffix}`,
      `--subdomain=${subdomain}`,
      "--branch-name=Main Branch",
      "--branch-code=MAIN",
      "--admin-name=E2E Isolation Admin",
      `--admin-email=${adminEmail}`,
      "--admin-password=vidyalaya-e2e-throwaway",
      ...(planTier ? [`--plan=${planTier}`] : []),
    ],
    { cwd: REPO_ROOT },
  );

  const tenantIdMatch = stdout.match(/Tenant id:\s*(\S+)/);
  if (!tenantIdMatch) {
    throw new Error(`Could not parse tenant id from create-tenant output:\n${stdout}`);
  }

  return { tenantId: tenantIdMatch[1], adminEmail, adminPassword: "vidyalaya-e2e-throwaway" };
}

// Direct-SQL plan-tier change for licensing tests -- no cloud-api endpoint
// lets a tenant change its own plan (by design; that's vendor-admin-api's
// job), so this mirrors the exact UPDATE vendor-admin-api's
// TenantsService.updateTenant runs, without needing a second running
// service in the E2E harness just for this.
export async function setTenantPlanTier(tenantId: string, planTier: "trial" | "silver" | "gold"): Promise<void> {
  await execFileAsync("psql", [
    DATABASE_URL,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `UPDATE tenants SET plan_tier = '${planTier}' WHERE id = '${tenantId}';`,
  ]);
}

// Direct-SQL subscription-status change for licensing tests -- exercises
// PlanLimitsService.assertTenantActive's three branches (suspended, trial
// expired, subscription expired) without waiting for real time to pass.
// Pass null to clear a date field back to open-ended/NULL.
export async function setTenantSubscriptionStatus(
  tenantId: string,
  status: { trialEndsAt?: Date | null; subscriptionExpiresAt?: Date | null; isSuspended?: boolean },
): Promise<void> {
  const sets: string[] = [];
  if ("trialEndsAt" in status) {
    sets.push(`trial_ends_at = ${status.trialEndsAt ? `'${status.trialEndsAt.toISOString()}'` : "NULL"}`);
  }
  if ("subscriptionExpiresAt" in status) {
    sets.push(`subscription_expires_at = ${status.subscriptionExpiresAt ? `'${status.subscriptionExpiresAt.toISOString()}'` : "NULL"}`);
  }
  if ("isSuspended" in status) {
    sets.push(`is_suspended = ${status.isSuspended ? "true" : "false"}`);
  }
  if (sets.length === 0) return;

  await execFileAsync("psql", [
    DATABASE_URL,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `UPDATE tenants SET ${sets.join(", ")} WHERE id = '${tenantId}';`,
  ]);
}

// No tenant-delete endpoint exists yet (see docs/production-readiness.md),
// so cleanup goes straight to Postgres, in FK dependency order, exactly
// mirroring what create-tenant.ts itself inserts.
export async function cleanupThrowawayTenant(tenantId: string): Promise<void> {
  // branches (and every other domain table) run under FORCE ROW LEVEL
  // SECURITY -- even this schema-owning role needs app.tenant_id set to
  // this specific tenant, or every DELETE below silently matches zero
  // rows instead of erroring, exactly like the RLS gotcha documented in
  // apps/cloud-api/migrations/*_add-created-at-updated-at-everywhere.sql.
  const sql = `
    SELECT set_config('app.tenant_id', '${tenantId}', true);
    DELETE FROM student_guardians WHERE tenant_id = '${tenantId}';
    DELETE FROM admissions WHERE tenant_id = '${tenantId}';
    DELETE FROM guardians WHERE tenant_id = '${tenantId}';
    DELETE FROM students WHERE tenant_id = '${tenantId}';
    DELETE FROM staff WHERE tenant_id = '${tenantId}';
    DELETE FROM user_roles WHERE tenant_id = '${tenantId}';
    DELETE FROM users WHERE tenant_id = '${tenantId}';
    DELETE FROM role_permissions WHERE tenant_id = '${tenantId}';
    DELETE FROM roles WHERE tenant_id = '${tenantId}';
    DELETE FROM staff_categories WHERE tenant_id = '${tenantId}';
    DELETE FROM fee_categories WHERE tenant_id = '${tenantId}';
    DELETE FROM leave_types WHERE tenant_id = '${tenantId}';
    DELETE FROM retention_policies WHERE tenant_id = '${tenantId}';
    DELETE FROM master_data_items WHERE tenant_id = '${tenantId}';
    DELETE FROM academic_sessions WHERE tenant_id = '${tenantId}';
    DELETE FROM branches WHERE tenant_id = '${tenantId}';
    DELETE FROM tenants WHERE id = '${tenantId}';
  `;
  await execFileAsync("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", sql]);
}
