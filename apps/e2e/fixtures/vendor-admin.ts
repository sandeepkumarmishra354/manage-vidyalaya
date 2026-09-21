import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://vidyalaya:vidyalaya@localhost:5432/vidyalaya";

export interface ThrowawayVendorAdmin {
  email: string;
  password: string;
}

// Bootstraps a fresh vendor-admin operator account via the same one-time
// provisioning script a real deployment uses
// (apps/vendor-admin-api/scripts/create-vendor-admin.ts) -- there is no
// self-service signup for this table by design, so this is the only way
// to get a login for vendor-admin.spec.ts. A fresh email per call avoids
// colliding with any pre-existing/manually-created vendor_admins row.
export async function provisionThrowawayVendorAdmin(): Promise<ThrowawayVendorAdmin> {
  const email = `e2e-vendor-${Date.now()}@example.com`;
  const password = "vidyalaya-e2e-vendor-throwaway";

  await execFileAsync(
    "pnpm",
    [
      "--filter",
      "vendor-admin-api",
      "create-vendor-admin",
      `--email=${email}`,
      `--full-name=E2E Vendor Admin`,
      `--password=${password}`,
    ],
    { cwd: REPO_ROOT },
  );

  return { email, password };
}

export async function cleanupThrowawayVendorAdmin(email: string): Promise<void> {
  // vendor_admins has no RLS (it's not tenant-scoped data), so a plain
  // delete needs no app.tenant_id session var, unlike
  // cleanupThrowawayTenant's tenant-scoped tables.
  await execFileAsync("psql", [
    DATABASE_URL,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `DELETE FROM vendor_admins WHERE email = '${email}';`,
  ]);
}
