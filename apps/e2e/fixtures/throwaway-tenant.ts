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
export async function provisionThrowawayTenant(): Promise<ThrowawayTenant> {
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
    ],
    { cwd: REPO_ROOT },
  );

  const tenantIdMatch = stdout.match(/Tenant id:\s*(\S+)/);
  if (!tenantIdMatch) {
    throw new Error(`Could not parse tenant id from create-tenant output:\n${stdout}`);
  }

  return { tenantId: tenantIdMatch[1], adminEmail, adminPassword: "vidyalaya-e2e-throwaway" };
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
    DELETE FROM user_roles WHERE tenant_id = '${tenantId}';
    DELETE FROM users WHERE tenant_id = '${tenantId}';
    DELETE FROM role_permissions WHERE tenant_id = '${tenantId}';
    DELETE FROM roles WHERE tenant_id = '${tenantId}';
    DELETE FROM staff_categories WHERE tenant_id = '${tenantId}';
    DELETE FROM fee_categories WHERE tenant_id = '${tenantId}';
    DELETE FROM master_data_items WHERE tenant_id = '${tenantId}';
    DELETE FROM academic_sessions WHERE tenant_id = '${tenantId}';
    DELETE FROM branches WHERE tenant_id = '${tenantId}';
    DELETE FROM tenants WHERE id = '${tenantId}';
  `;
  await execFileAsync("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", sql]);
}
