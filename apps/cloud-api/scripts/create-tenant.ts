// Provisions a real school tenant: a fresh tenant + main branch + default
// roles/permissions/categories/master data + a first super_admin login,
// exactly like seed.ts does for the fixed demo tenant, but parameterized and
// with real random UUIDs. Run once per school being onboarded (see
// docs/production-readiness.md's onboarding runbook for the full DNS/SSL
// checklist this fits into).
//
// Connects as the schema-owning role (DATABASE_URL, not APP_DATABASE_URL) --
// RLS never applies to a table's owner, and provisioning a brand-new tenant
// is exactly the "no tenant context yet" case that role is reserved for.
import "dotenv/config";

import { randomBytes, randomUUID } from "node:crypto";

import * as bcrypt from "bcryptjs";
import pg from "pg";

import { SYSTEM_ROLE_PERMISSIONS } from "../src/common/permission-catalog.js";
import { FEE_TYPES } from "../src/fees/fee-type.js";

const { Pool } = pg;

interface Args {
  schoolName: string;
  subdomain: string;
  branchName: string;
  branchCode: string;
  adminName: string;
  adminEmail: string;
  adminPassword?: string;
}

function usage(): never {
  console.error(
    `Usage: pnpm create-tenant --school-name="Greenwood International" --subdomain=greenwood \\
    --branch-name="Main Campus" --branch-code=MAIN \\
    --admin-name="Jane Doe" --admin-email=admin@greenwood.example [--admin-password=...]

If --admin-password is omitted, a random one is generated and printed once.`,
  );
  process.exit(1);
}

function parseArgs(): Args {
  const values = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!match) usage();
    values.set(match[1], match[2]);
  }

  const schoolName = values.get("school-name");
  const subdomain = values.get("subdomain");
  const branchName = values.get("branch-name");
  const branchCode = values.get("branch-code");
  const adminName = values.get("admin-name");
  const adminEmail = values.get("admin-email");
  if (!schoolName || !subdomain || !branchName || !branchCode || !adminName || !adminEmail) {
    usage();
  }

  if (!/^[a-z0-9-]+$/.test(subdomain)) {
    console.error(`Invalid --subdomain "${subdomain}": must be lowercase letters, digits, and hyphens only.`);
    process.exit(1);
  }

  return {
    schoolName,
    subdomain,
    branchName,
    branchCode,
    adminName,
    adminEmail,
    adminPassword: values.get("admin-password"),
  };
}

// Default StaffCategory/FeeCategory/MasterDataItem rows, copied from
// seed.ts -- kept as its own copy rather than a shared import since both
// scripts are small, standalone, and already diverge in what tenant they
// target and how they get their ids.
const DEFAULT_STAFF_CATEGORIES = [
  "Teacher",
  "Accountant",
  "Librarian",
  "Peon",
  "Driver",
  "Security Guard",
  "Admin Staff",
  "Nurse",
  "Lab Assistant",
  "Sports Coach",
];

const DEFAULT_FEE_CATEGORIES: { key: string; name: string }[] = FEE_TYPES.map((key) => ({
  key,
  name: key.charAt(0).toUpperCase() + key.slice(1),
}));

const DEFAULT_MASTER_DATA_ITEMS: { type: string; name: string }[] = [
  ...["General", "OBC", "SC", "ST", "Other"].map((name) => ({ type: "student_category", name })),
  ...["Male", "Female", "Other"].map((name) => ({ type: "gender", name })),
  ...["Father", "Mother", "Guardian"].map((name) => ({ type: "guardian_relation", name })),
  ...["Utilities", "Stationery", "Maintenance", "Transport & Fuel", "Miscellaneous"].map((name) => ({
    type: "expense_category",
    name,
  })),
];

const SYSTEM_ROLE_NAMES = ["super_admin", "branch_admin", "accountant", "teacher", "front_desk"] as const;

function generatePassword(): string {
  return randomBytes(9).toString("base64url");
}

async function main() {
  const args = parseArgs();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const now = new Date();
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const adminPassword = args.adminPassword ?? generatePassword();

  // One client held for the whole script so the transaction-local RLS
  // session variable applies to every statement -- same pattern as
  // seed.ts's main().
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: existing } = await client.query<{ id: string }>(
      "SELECT id FROM tenants WHERE subdomain = $1",
      [args.subdomain],
    );
    if (existing.length > 0) {
      throw new Error(`Subdomain "${args.subdomain}" is already taken by tenant ${existing[0].id}.`);
    }

    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

    await client.query(
      `INSERT INTO tenants (id, name, subdomain, subscription_status, updated_at)
       VALUES ($1, $2, $3, 'trial', $4)`,
      [tenantId, args.schoolName, args.subdomain, now],
    );

    await client.query(
      `INSERT INTO branches (id, tenant_id, name, code, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [branchId, tenantId, args.branchName, args.branchCode, now],
    );

    const roleIds = new Map<string, string>();
    for (const roleName of SYSTEM_ROLE_NAMES) {
      const roleId = randomUUID();
      roleIds.set(roleName, roleId);
      await client.query(
        `INSERT INTO roles (id, tenant_id, name, is_system, updated_at)
         VALUES ($1, $2, $3, true, $4)`,
        [roleId, tenantId, roleName, now],
      );

      for (const permissionKey of SYSTEM_ROLE_PERMISSIONS[roleName]) {
        await client.query(
          `INSERT INTO role_permissions (id, tenant_id, role_id, permission_key, updated_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), tenantId, roleId, permissionKey, now],
        );
      }
    }

    for (const name of DEFAULT_STAFF_CATEGORIES) {
      await client.query(
        `INSERT INTO staff_categories (id, tenant_id, name, is_system, updated_at)
         VALUES ($1, $2, $3, true, $4)`,
        [randomUUID(), tenantId, name, now],
      );
    }

    for (const { key, name } of DEFAULT_FEE_CATEGORIES) {
      await client.query(
        `INSERT INTO fee_categories (id, tenant_id, key, name, is_system, updated_at)
         VALUES ($1, $2, $3, $4, true, $5)`,
        [randomUUID(), tenantId, key, name, now],
      );
    }

    for (const { type, name } of DEFAULT_MASTER_DATA_ITEMS) {
      await client.query(
        `INSERT INTO master_data_items (id, tenant_id, type, name, is_system, updated_at)
         VALUES ($1, $2, $3, $4, true, $5)`,
        [randomUUID(), tenantId, type, name, now],
      );
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const userId = randomUUID();
    await client.query(
      `INSERT INTO users (id, tenant_id, full_name, email, password_hash, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, tenantId, args.adminName, args.adminEmail, passwordHash, now],
    );

    const superAdminRoleId = roleIds.get("super_admin");
    if (!superAdminRoleId) throw new Error("super_admin role was not created");
    await client.query(
      `INSERT INTO user_roles (id, tenant_id, user_id, role_id, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), tenantId, userId, superAdminRoleId, now],
    );

    await client.query("COMMIT");

    console.log("Tenant provisioned successfully.");
    console.log("  Tenant id:  ", tenantId);
    console.log("  School:     ", args.schoolName);
    console.log("  Subdomain:  ", args.subdomain);
    console.log("  Branch:     ", args.branchName, `(${args.branchCode})`);
    console.log("  Admin login:", args.adminEmail);
    console.log("  Admin pass: ", adminPassword);
    console.log("Hand these credentials to the school and have them change the password after first login.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
