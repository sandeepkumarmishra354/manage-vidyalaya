import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://vidyalaya:vidyalaya@localhost:5432/vidyalaya";

// Bulk-seeds rows directly against Postgres rather than through the API --
// getting close to a plan limit (300 students, 30 staff) one API call at a
// time would make these tests minutes slower for no extra coverage; the
// thing under test is the boundary check itself, not the insert path
// (that's already covered by the unit tests for confirmAdmission/
// createStaff). Every domain table runs under FORCE ROW LEVEL SECURITY, so
// app.tenant_id must be set first even for this schema-owning connection,
// exactly like cleanupThrowawayTenant.
async function runSql(sql: string): Promise<void> {
  await execFileAsync("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", sql]);
}

// `id` is a globally unique text primary key (no per-tenant scoping), so
// the generated ids below are namespaced by tenantId -- otherwise two
// different throwaway tenants' bulk-seeded rows collide on the same
// literal "e2e-bulk-student-1" id.
export async function bulkInsertEnrolledStudents(tenantId: string, branchId: string, count: number): Promise<void> {
  await runSql(`
    SELECT set_config('app.tenant_id', '${tenantId}', true);
    INSERT INTO students (id, tenant_id, branch_id, first_name, status, updated_at)
    SELECT 'e2e-bulk-student-${tenantId}-' || g, '${tenantId}', '${branchId}', 'BulkStudent' || g, 'enrolled', now()
    FROM generate_series(1, ${count}) g;
  `);
}

export async function bulkInsertActiveStaff(tenantId: string, branchId: string, count: number): Promise<void> {
  await runSql(`
    SELECT set_config('app.tenant_id', '${tenantId}', true);
    INSERT INTO staff (id, tenant_id, branch_id, employee_code, first_name, designation, date_of_joining, status, updated_at)
    SELECT 'e2e-bulk-staff-${tenantId}-' || g, '${tenantId}', '${branchId}', 'BULK-' || g, 'BulkStaff' || g, 'E2E Test Staff', now(), 'active', now()
    FROM generate_series(1, ${count}) g;
  `);
}
