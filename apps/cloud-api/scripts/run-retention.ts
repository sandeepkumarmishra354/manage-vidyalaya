// DPDP retention sweep: anonymizes departed students' and departed staff's
// identity fields once they're past their tenant's configured retention
// period (see src/retention/retention-categories.ts for the category
// list and why financial_records/academic_records are never swept here).
// Dry run by default -- pass --execute to actually mutate anything.
//
// Usage:
//   pnpm retention:run                      # dry run, every tenant
//   pnpm retention:run --tenant=<id>        # dry run, one tenant
//   pnpm retention:run --execute            # actually sweep, every tenant
//   pnpm retention:run --tenant=<id> --execute
//
// Connects as the schema-owning role (DATABASE_URL, not APP_DATABASE_URL) --
// RLS never applies to a table's owner, and sweeping across every tenant is
// exactly the "no single tenant context" case that role is reserved for,
// same as scripts/backfill-staff-categories.ts.
import "dotenv/config";

import { randomUUID } from "node:crypto";

import pg from "pg";

import { LocalStorageDriver } from "../src/storage/local-storage.driver.js";
import { S3StorageDriver } from "../src/storage/s3-storage.driver.js";
import type { StorageDriver } from "../src/storage/storage.types.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Mirrors StorageService's own driver selection -- a standalone script has
// no NestJS DI to pull StorageService from, and both drivers have no
// constructor dependencies beyond env vars, so `new`-ing one directly here
// is safe.
function getStorageDriver(): StorageDriver {
  return process.env.STORAGE_DRIVER === "s3" ? new S3StorageDriver() : new LocalStorageDriver();
}

function parseArgs() {
  const tenantArg = process.argv.find((a) => a.startsWith("--tenant="));
  return {
    tenantId: tenantArg?.split("=")[1],
    execute: process.argv.includes("--execute"),
  };
}

interface EligibleStudent {
  id: string;
  branch_id: string;
  first_name: string;
  photo_path: string | null;
}

interface EligibleStaff {
  id: string;
  branch_id: string;
  first_name: string;
  photo_path: string | null;
  signature_url: string | null;
}

async function findEligibleStudents(client: pg.PoolClient, tenantId: string, retentionYears: number) {
  const { rows } = await client.query<EligibleStudent>(
    `SELECT id, branch_id, first_name, photo_path FROM students
     WHERE tenant_id = $1 AND deleted_at IS NULL AND anonymized_at IS NULL
       AND status IN ('withdrawn', 'alumni') AND date_of_leaving IS NOT NULL
       AND date_of_leaving < now() - ($2 || ' years')::interval`,
    [tenantId, retentionYears],
  );
  return rows;
}

async function findEligibleStaff(client: pg.PoolClient, tenantId: string, retentionYears: number) {
  const { rows } = await client.query<EligibleStaff>(
    `SELECT id, branch_id, first_name, photo_path, signature_url FROM staff
     WHERE tenant_id = $1 AND deleted_at IS NULL AND anonymized_at IS NULL
       AND status IN ('relieved', 'terminated', 'inactive') AND date_of_leaving IS NOT NULL
       AND date_of_leaving < now() - ($2 || ' years')::interval`,
    [tenantId, retentionYears],
  );
  return rows;
}

// Students with no date_of_leaving at all (TC never issued) can't have
// their retention clock computed -- reported separately, never guessed at.
async function countStudentsNeedingReview(client: pg.PoolClient, tenantId: string) {
  const { rows } = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM students
     WHERE tenant_id = $1 AND deleted_at IS NULL AND anonymized_at IS NULL
       AND status IN ('withdrawn', 'alumni') AND date_of_leaving IS NULL`,
    [tenantId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function insertAuditRow(client: pg.PoolClient, tenantId: string, branchId: string, entityTable: string, entityId: string, summary: string, now: Date) {
  await client.query(
    `INSERT INTO audit_log (id, tenant_id, branch_id, actor_user_id, entity_table, entity_id, action, summary, created_at, updated_at)
     VALUES ($1, $2, $3, NULL, $4, $5, 'anonymize', $6, $7, $7)`,
    [randomUUID(), tenantId, branchId, entityTable, entityId, summary, now],
  );
}

// Anonymizes one student's own row plus its documents, then cascades to
// any guardian whose *every* linked student is now anonymized. Its own
// transaction per student (not one big per-tenant transaction) so a crash
// mid-sweep leaves already-processed students committed rather than
// rolling back an entire tenant's progress.
async function anonymizeStudent(tenantId: string, retentionYears: number, student: EligibleStudent) {
  const client = await pool.connect();
  const filesToDelete: string[] = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const now = new Date();

    await client.query(
      `UPDATE students SET
         first_name = 'Redacted', last_name = NULL, date_of_birth = NULL,
         address = NULL, city = NULL, state = NULL, pincode = NULL,
         aadhaar_number = NULL, blood_group = NULL, religion = NULL, category = NULL,
         mother_tongue = NULL, nationality = NULL, emergency_contact_name = NULL,
         emergency_contact_phone = NULL, medical_notes = NULL, alumni_contact_email = NULL,
         photo_path = NULL, anonymized_at = $1, updated_at = $1,
         updated_by = 'system:retention-sweep', version = version + 1
       WHERE id = $2 AND tenant_id = $3`,
      [now, student.id, tenantId],
    );
    if (student.photo_path) filesToDelete.push(student.photo_path);

    const { rows: docs } = await client.query<{ id: string; storage_key: string }>(
      "SELECT id, storage_key FROM student_documents WHERE student_id = $1 AND tenant_id = $2 AND deleted_at IS NULL",
      [student.id, tenantId],
    );
    for (const doc of docs) {
      await client.query("DELETE FROM student_documents WHERE id = $1 AND tenant_id = $2", [doc.id, tenantId]);
      filesToDelete.push(doc.storage_key);
    }

    // student_guardians is a plain join table with no deleted_at column
    // (no soft delete) -- unlike almost every other table in this schema.
    const { rows: guardianLinks } = await client.query<{ guardian_id: string }>(
      "SELECT guardian_id FROM student_guardians WHERE student_id = $1 AND tenant_id = $2",
      [student.id, tenantId],
    );
    let guardiansAnonymized = 0;
    for (const { guardian_id } of guardianLinks) {
      const { rows: siblingLinks } = await client.query<{ student_id: string; anonymized_at: Date | null }>(
        `SELECT sg.student_id, s.anonymized_at FROM student_guardians sg
         JOIN students s ON s.id = sg.student_id AND s.tenant_id = sg.tenant_id
         WHERE sg.guardian_id = $1 AND sg.tenant_id = $2 AND s.deleted_at IS NULL`,
        [guardian_id, tenantId],
      );
      const everyLinkedStudentAnonymized = siblingLinks.every((link) => link.student_id === student.id || link.anonymized_at !== null);
      if (everyLinkedStudentAnonymized) {
        const { rowCount } = await client.query(
          `UPDATE guardians SET
             full_name = 'Redacted', phone = NULL, alt_phone = NULL, email = NULL,
             occupation = NULL, address = NULL, aadhaar_number = NULL, annual_income = NULL,
             anonymized_at = $1, updated_at = $1, updated_by = 'system:retention-sweep', version = version + 1
           WHERE id = $2 AND tenant_id = $3 AND anonymized_at IS NULL`,
          [now, guardian_id, tenantId],
        );
        guardiansAnonymized += rowCount ?? 0;
      }
    }

    await insertAuditRow(
      client,
      tenantId,
      student.branch_id,
      "students",
      student.id,
      `Retention sweep anonymized student identity (category=student_identity, retention_years=${retentionYears})`,
      now,
    );

    await client.query("COMMIT");
    return { filesToDelete, guardiansAnonymized };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function anonymizeStaffMember(tenantId: string, retentionYears: number, staff: EligibleStaff) {
  const client = await pool.connect();
  const filesToDelete: string[] = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const now = new Date();

    await client.query(
      `UPDATE staff SET
         first_name = 'Redacted', last_name = NULL, date_of_birth = NULL,
         phone = NULL, personal_email = NULL, address = NULL, city = NULL, state = NULL,
         pincode = NULL, aadhaar_number = NULL, emergency_contact_name = NULL,
         emergency_contact_phone = NULL, photo_path = NULL, signature_url = NULL,
         anonymized_at = $1, updated_at = $1, updated_by = 'system:retention-sweep', version = version + 1
       WHERE id = $2 AND tenant_id = $3`,
      // Deliberately untouched: pan_number, bank_account_number, bank_ifsc,
      // bank_name, pf_number, esi_number, uan_number -- payroll/tax
      // compliance data belonging to the dormant financial_records
      // category, not this identity sweep.
      [now, staff.id, tenantId],
    );
    if (staff.photo_path) filesToDelete.push(staff.photo_path);
    if (staff.signature_url) filesToDelete.push(staff.signature_url);

    const { rows: docs } = await client.query<{ id: string; storage_key: string }>(
      "SELECT id, storage_key FROM staff_documents WHERE staff_id = $1 AND tenant_id = $2 AND deleted_at IS NULL",
      [staff.id, tenantId],
    );
    for (const doc of docs) {
      await client.query("DELETE FROM staff_documents WHERE id = $1 AND tenant_id = $2", [doc.id, tenantId]);
      filesToDelete.push(doc.storage_key);
    }

    await insertAuditRow(
      client,
      tenantId,
      staff.branch_id,
      "staff",
      staff.id,
      `Retention sweep anonymized staff identity (category=staff_identity, retention_years=${retentionYears})`,
      now,
    );

    await client.query("COMMIT");
    return { filesToDelete };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const { tenantId: onlyTenantId, execute } = parseArgs();
  const storage = getStorageDriver();

  const listClient = await pool.connect();
  let tenants: { id: string; name: string }[];
  try {
    tenants = onlyTenantId
      ? (await listClient.query<{ id: string; name: string }>("SELECT id, name FROM tenants WHERE id = $1", [onlyTenantId])).rows
      : (await listClient.query<{ id: string; name: string }>("SELECT id, name FROM tenants")).rows;
  } finally {
    listClient.release();
  }

  if (onlyTenantId && tenants.length === 0) {
    throw new Error(`No tenant found with id "${onlyTenantId}".`);
  }

  let totalStudentsAnonymized = 0;
  let totalGuardiansAnonymized = 0;
  let totalStaffAnonymized = 0;
  let totalFilesDeleted = 0;

  for (const tenant of tenants) {
    const policyClient = await pool.connect();
    let policies: { category: string; retention_years: number; is_active: boolean }[];
    try {
      await policyClient.query("BEGIN");
      await policyClient.query("SELECT set_config('app.tenant_id', $1, true)", [tenant.id]);
      const result = await policyClient.query<{ category: string; retention_years: number; is_active: boolean }>(
        "SELECT category, retention_years, is_active FROM retention_policies WHERE tenant_id = $1 AND deleted_at IS NULL",
        [tenant.id],
      );
      policies = result.rows;

      const studentPolicy = policies.find((p) => p.category === "student_identity" && p.is_active);
      const staffPolicy = policies.find((p) => p.category === "staff_identity" && p.is_active);

      const eligibleStudents = studentPolicy ? await findEligibleStudents(policyClient, tenant.id, studentPolicy.retention_years) : [];
      const eligibleStaff = staffPolicy ? await findEligibleStaff(policyClient, tenant.id, staffPolicy.retention_years) : [];
      const needsReview = studentPolicy ? await countStudentsNeedingReview(policyClient, tenant.id) : 0;

      await policyClient.query("COMMIT");

      console.log(`\n=== ${tenant.name} (${tenant.id}) ===`);
      if (!studentPolicy) console.log("  student_identity: dormant, skipped");
      else console.log(`  student_identity: ${eligibleStudents.length} eligible (retention_years=${studentPolicy.retention_years})`);
      if (!staffPolicy) console.log("  staff_identity: dormant, skipped");
      else console.log(`  staff_identity: ${eligibleStaff.length} eligible (retention_years=${staffPolicy.retention_years})`);
      if (needsReview > 0) console.log(`  ${needsReview} withdrawn/alumni student(s) have no date_of_leaving -- needs manual review, not swept`);

      if (!execute) {
        if (eligibleStudents.length > 0) console.log("  student ids:", eligibleStudents.map((s) => s.id).join(", "));
        if (eligibleStaff.length > 0) console.log("  staff ids:", eligibleStaff.map((s) => s.id).join(", "));
        continue;
      }

      for (const student of eligibleStudents) {
        const { filesToDelete, guardiansAnonymized } = await anonymizeStudent(tenant.id, studentPolicy!.retention_years, student);
        for (const key of filesToDelete) await storage.deleteObject(key);
        totalStudentsAnonymized++;
        totalGuardiansAnonymized += guardiansAnonymized;
        totalFilesDeleted += filesToDelete.length;
      }

      for (const staff of eligibleStaff) {
        const { filesToDelete } = await anonymizeStaffMember(tenant.id, staffPolicy!.retention_years, staff);
        for (const key of filesToDelete) await storage.deleteObject(key);
        totalStaffAnonymized++;
        totalFilesDeleted += filesToDelete.length;
      }
    } catch (err) {
      await policyClient.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      policyClient.release();
    }
  }

  console.log(
    execute
      ? `\nDone. Anonymized ${totalStudentsAnonymized} student(s), ${totalGuardiansAnonymized} guardian(s), ${totalStaffAnonymized} staff member(s); deleted ${totalFilesDeleted} file(s).`
      : "\nDry run only -- nothing was written. Re-run with --execute to actually sweep.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
