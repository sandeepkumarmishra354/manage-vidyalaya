// Dev/demo seed script. Creates a tenant/branch/admin user with fixed,
// well-known ids for local development. Production tenants come from the
// (future) school signup/provisioning flow instead, with random UUIDs.
//
// Connects as the schema-owning role (DATABASE_URL, not APP_DATABASE_URL) --
// RLS never applies to a table's owner, and seeding a brand-new tenant is
// exactly the "no tenant context yet" case that role is reserved for.
import "dotenv/config";

import { randomUUID } from "node:crypto";

import * as bcrypt from "bcryptjs";
import pg from "pg";

import { SYSTEM_ROLE_PERMISSIONS } from "../src/common/permission-catalog.js";
import { FEE_TYPES } from "../src/fees/fee-type.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_BRANCH_ID = "00000000-0000-0000-0000-000000000002";
const DEMO_ADMIN_EMAIL = "admin@demo.vidyalaya.in";
const DEMO_ADMIN_PASSWORD = "vidyalaya-demo";

// A second, real, presentable branch -- doubles as the sandbox the
// Playwright E2E suite (apps/e2e/) creates/mutates test data in, so "Main
// Campus" stays untouched for human demos. Fixed id for the same
// re-run-safety reason as DEMO_BRANCH_ID.
const NORTH_BRANCH_ID = "00000000-0000-0000-0000-000000000003";

// Fixed ids, same reason as DEMO_TENANT_ID/DEMO_BRANCH_ID above: re-running
// this script (e.g. after a schema reset) must upsert the same rows rather
// than creating duplicates, and `roles` has a UNIQUE (tenant_id, name)
// constraint.
const DEMO_ROLE_SUPER_ADMIN_ID = "00000000-0000-0000-0000-000000000010";
const DEMO_ROLE_BRANCH_ADMIN_ID = "00000000-0000-0000-0000-000000000011";
const DEMO_ROLE_ACCOUNTANT_ID = "00000000-0000-0000-0000-000000000012";
const DEMO_ROLE_TEACHER_ID = "00000000-0000-0000-0000-000000000013";
const DEMO_ROLE_FRONT_DESK_ID = "00000000-0000-0000-0000-000000000014";

const DEFAULT_ROLES: { id: string; name: string; permissions: readonly string[] }[] = [
  { id: DEMO_ROLE_SUPER_ADMIN_ID, name: "super_admin", permissions: SYSTEM_ROLE_PERMISSIONS.super_admin },
  { id: DEMO_ROLE_BRANCH_ADMIN_ID, name: "branch_admin", permissions: SYSTEM_ROLE_PERMISSIONS.branch_admin },
  { id: DEMO_ROLE_ACCOUNTANT_ID, name: "accountant", permissions: SYSTEM_ROLE_PERMISSIONS.accountant },
  { id: DEMO_ROLE_TEACHER_ID, name: "teacher", permissions: SYSTEM_ROLE_PERMISSIONS.teacher },
  { id: DEMO_ROLE_FRONT_DESK_ID, name: "front_desk", permissions: SYSTEM_ROLE_PERMISSIONS.front_desk },
];

// QA/E2E persona logins -- one per remaining default role, plus two teacher
// logins (a class teacher and a subject-assigned teacher) so
// ScopedAccessService's additive authorization paths (isClassTeacherOfSection,
// isAssignedToSubject) have real staff/assignment data to exercise, not just
// the flat `teacher` permission set. All share one well-known password.
// Every persona gets a real `staff` row (linked via user_id) since
// ScopedAccessService.getActingStaff resolves a logged-in user to their
// staff record that way -- a login with no backing staff row wouldn't work
// correctly as a teacher persona.
const QA_PERSONA_PASSWORD = "vidyalaya-qa-2026";

const QA_PERSONAS: { email: string; fullName: string; employeeCode: string; designation: string; roleId: string }[] = [
  {
    email: "qa.branchadmin@demo.vidyalaya.in",
    fullName: "QA Branch Admin",
    employeeCode: "QA-BA-01",
    designation: "Branch Administrator",
    roleId: DEMO_ROLE_BRANCH_ADMIN_ID,
  },
  {
    email: "qa.accountant@demo.vidyalaya.in",
    fullName: "QA Accountant",
    employeeCode: "QA-AC-01",
    designation: "Accountant",
    roleId: DEMO_ROLE_ACCOUNTANT_ID,
  },
  {
    email: "qa.frontdesk@demo.vidyalaya.in",
    fullName: "QA Front Desk",
    employeeCode: "QA-FD-01",
    designation: "Front Desk Executive",
    roleId: DEMO_ROLE_FRONT_DESK_ID,
  },
  {
    email: "qa.classteacher@demo.vidyalaya.in",
    fullName: "QA Class Teacher",
    employeeCode: "QA-CT-01",
    designation: "Teacher",
    roleId: DEMO_ROLE_TEACHER_ID,
  },
  {
    email: "qa.subjectteacher@demo.vidyalaya.in",
    fullName: "QA Subject Teacher",
    employeeCode: "QA-ST-01",
    designation: "Teacher",
    roleId: DEMO_ROLE_TEACHER_ID,
  },
];

// Default StaffCategory rows seeded per tenant -- a broad classification,
// additive alongside Staff.designation's free text. Tenant admins can add
// more via the UI; these are just sensible defaults to start from.
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

// Default FeeCategory rows seeded per tenant, matching the existing
// FEE_TYPES keys exactly so fee_structures.fee_type values keep resolving.
const DEFAULT_FEE_CATEGORIES: { key: string; name: string }[] = FEE_TYPES.map((key) => ({
  key,
  name: key.charAt(0).toUpperCase() + key.slice(1),
}));

// Default MasterDataItem rows seeded per tenant -- these exactly preserve
// the option lists that used to be hardcoded directly in the admission/
// guardian dialogs, so switching those dialogs over to the Master Data
// admin page doesn't change what a school sees on day one.
const DEFAULT_MASTER_DATA_ITEMS: { type: string; name: string }[] = [
  ...["General", "OBC", "SC", "ST", "Other"].map((name) => ({ type: "student_category", name })),
  ...["Male", "Female", "Other"].map((name) => ({ type: "gender", name })),
  ...["Father", "Mother", "Guardian"].map((name) => ({ type: "guardian_relation", name })),
  ...["Utilities", "Stationery", "Maintenance", "Transport & Fuel", "Miscellaneous"].map((name) => ({
    type: "expense_category",
    name,
  })),
];

async function main() {
  const now = new Date();

  // One client held for the whole script (not pool.query() per call, which
  // may hand back a different pooled connection each time) so the
  // transaction-local RLS session variable set below applies to every
  // statement. Every row this script writes belongs to DEMO_TENANT_ID, so
  // setting app.tenant_id to that one tenant up front (rather than adding a
  // bypass) satisfies the ordinary tenant_isolation policy's WITH CHECK on
  // every insert -- transaction-scoped, like every other write in this
  // codebase, so it can't leak onto another connection once released.
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [DEMO_TENANT_ID]);

    await client.query(
      `INSERT INTO tenants (id, name, subscription_status, updated_at)
       VALUES ($1, $2, 'trial', $3)
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_TENANT_ID, "Demo Vidyalaya School", now],
    );

    await client.query(
      `INSERT INTO branches (id, tenant_id, name, code, city, updated_at)
       VALUES ($1, $2, 'Main Campus', 'MAIN', 'New Delhi', $3)
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_BRANCH_ID, DEMO_TENANT_ID, now],
    );

    await client.query(
      `INSERT INTO branches (id, tenant_id, name, code, city, updated_at)
       VALUES ($1, $2, 'North Campus', 'NORTH', 'Gurugram', $3)
       ON CONFLICT (id) DO NOTHING`,
      [NORTH_BRANCH_ID, DEMO_TENANT_ID, now],
    );

    for (const defaultRole of DEFAULT_ROLES) {
      await client.query(
        `INSERT INTO roles (id, tenant_id, name, is_system, updated_at)
         VALUES ($1, $2, $3, true, $4)
         ON CONFLICT (id) DO NOTHING`,
        [defaultRole.id, DEMO_TENANT_ID, defaultRole.name, now],
      );

      for (const permissionKey of defaultRole.permissions) {
        await client.query(
          `INSERT INTO role_permissions (id, tenant_id, role_id, permission_key, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (role_id, permission_key) DO UPDATE SET deleted_at = NULL`,
          [randomUUID(), DEMO_TENANT_ID, defaultRole.id, permissionKey, now],
        );
      }

      // Reconcile: soft-delete any grant this system role no longer has in
      // permission-catalog.ts (e.g. a renamed/split key from a past catalog
      // change) so re-seeding never leaves stale role_permissions rows behind.
      const currentKeys = new Set(defaultRole.permissions);
      const { rows: existingGrants } = await client.query<{ id: string; permission_key: string }>(
        "SELECT id, permission_key FROM role_permissions WHERE role_id = $1 AND deleted_at IS NULL",
        [defaultRole.id],
      );
      for (const grant of existingGrants) {
        if (!currentKeys.has(grant.permission_key)) {
          await client.query(
            "UPDATE role_permissions SET deleted_at = $1, updated_at = $1, version = version + 1 WHERE id = $2",
            [now, grant.id],
          );
        }
      }
    }

    for (const name of DEFAULT_STAFF_CATEGORIES) {
      await client.query(
        `INSERT INTO staff_categories (id, tenant_id, name, is_system, updated_at)
         VALUES ($1, $2, $3, true, $4)
         ON CONFLICT (tenant_id, name) WHERE deleted_at IS NULL DO UPDATE SET deleted_at = NULL`,
        [randomUUID(), DEMO_TENANT_ID, name, now],
      );
    }

    for (const { key, name } of DEFAULT_FEE_CATEGORIES) {
      await client.query(
        `INSERT INTO fee_categories (id, tenant_id, key, name, is_system, updated_at)
         VALUES ($1, $2, $3, $4, true, $5)
         ON CONFLICT (tenant_id, key) WHERE deleted_at IS NULL DO UPDATE SET deleted_at = NULL`,
        [randomUUID(), DEMO_TENANT_ID, key, name, now],
      );
    }

    for (const { type, name } of DEFAULT_MASTER_DATA_ITEMS) {
      await client.query(
        `INSERT INTO master_data_items (id, tenant_id, type, name, is_system, updated_at)
         VALUES ($1, $2, $3, $4, true, $5)
         ON CONFLICT (tenant_id, type, name) WHERE deleted_at IS NULL DO UPDATE SET deleted_at = NULL`,
        [randomUUID(), DEMO_TENANT_ID, type, name, now],
      );
    }

    const passwordHash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 10);
    const userId = randomUUID();

    const { rows: userRows } = await client.query<{ id: string }>(
      `INSERT INTO users (id, tenant_id, full_name, email, password_hash, updated_at)
       VALUES ($1, $2, 'Demo Admin', $3, $4, $5)
       ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = $4
       RETURNING id`,
      [userId, DEMO_TENANT_ID, DEMO_ADMIN_EMAIL, passwordHash, now],
    );
    const user = userRows[0];

    await client.query(
      `INSERT INTO user_roles (id, tenant_id, user_id, role_id, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [randomUUID(), DEMO_TENANT_ID, user.id, DEMO_ROLE_SUPER_ADMIN_ID, now],
    );

    const qaPasswordHash = await bcrypt.hash(QA_PERSONA_PASSWORD, 10);
    for (const persona of QA_PERSONAS) {
      const { rows: personaUserRows } = await client.query<{ id: string }>(
        `INSERT INTO users (id, tenant_id, full_name, email, password_hash, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = $5
         RETURNING id`,
        [randomUUID(), DEMO_TENANT_ID, persona.fullName, persona.email, qaPasswordHash, now],
      );
      const personaUser = personaUserRows[0];

      await client.query(
        `INSERT INTO staff (id, tenant_id, branch_id, user_id, employee_code, first_name, designation, date_of_joining, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         ON CONFLICT (tenant_id, employee_code) DO UPDATE SET user_id = $4, updated_at = $8`,
        [randomUUID(), DEMO_TENANT_ID, NORTH_BRANCH_ID, personaUser.id, persona.employeeCode, persona.fullName, persona.designation, now],
      );

      await client.query(
        `INSERT INTO user_roles (id, tenant_id, user_id, role_id, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [randomUUID(), DEMO_TENANT_ID, personaUser.id, persona.roleId, now],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  console.log("Seeded demo tenant:", DEMO_TENANT_ID);
  console.log("Login with:", DEMO_ADMIN_EMAIL, "/", DEMO_ADMIN_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
