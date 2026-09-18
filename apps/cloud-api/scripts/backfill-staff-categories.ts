// One-off, reviewed backfill: best-effort maps existing staff.designation
// free text to the StaffCategory lookup rows. Deliberately NOT run
// automatically by the migration or seed script -- run by hand, review the
// printed matches, then re-run with --apply to write them.
//
// Usage:
//   pnpm exec tsx scripts/backfill-staff-categories.ts            # dry run, prints matches only
//   pnpm exec tsx scripts/backfill-staff-categories.ts --apply    # writes category_id for matched rows
import "dotenv/config";

import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Ordered so more specific keywords are checked before generic ones where it
// matters (e.g. "lab assistant" before "assistant" would matter if we had a
// bare "assistant" rule, which we don't -- kept simple/explicit instead).
const KEYWORD_RULES: { keyword: string; categoryName: string }[] = [
  { keyword: "teacher", categoryName: "Teacher" },
  { keyword: "pgt", categoryName: "Teacher" },
  { keyword: "tgt", categoryName: "Teacher" },
  { keyword: "prt", categoryName: "Teacher" },
  { keyword: "faculty", categoryName: "Teacher" },
  { keyword: "account", categoryName: "Accountant" },
  { keyword: "librar", categoryName: "Librarian" },
  { keyword: "peon", categoryName: "Peon" },
  { keyword: "driver", categoryName: "Driver" },
  { keyword: "security", categoryName: "Security Guard" },
  { keyword: "guard", categoryName: "Security Guard" },
  { keyword: "nurse", categoryName: "Nurse" },
  { keyword: "lab assistant", categoryName: "Lab Assistant" },
  { keyword: "sports", categoryName: "Sports Coach" },
  { keyword: "coach", categoryName: "Sports Coach" },
  { keyword: "clerk", categoryName: "Admin Staff" },
  { keyword: "admin", categoryName: "Admin Staff" },
];

function matchCategory(designation: string): string | null {
  const lower = designation.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (lower.includes(rule.keyword)) return rule.categoryName;
  }
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const now = new Date();

  // One client held for the whole script, so the transaction-local RLS
  // session variable set per tenant below applies to that tenant's own
  // queries and never leaks onto the next pooled connection. `tenants`
  // itself has no tenant_id column/RLS policy, so it's readable up front
  // regardless.
  const client = await pool.connect();
  let totalMatched = 0;
  let totalUnmatched = 0;

  try {
    const { rows: tenants } = await client.query<{ id: string; name: string }>("SELECT id, name FROM tenants");

    for (const tenant of tenants) {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant.id]);

      const { rows: categories } = await client.query<{ id: string; name: string }>(
        "SELECT id, name FROM staff_categories WHERE tenant_id = $1 AND deleted_at IS NULL",
        [tenant.id],
      );
      const categoryByName = new Map(categories.map((c) => [c.name, c.id]));

      const { rows: staff } = await client.query<{ id: string; employee_code: string; designation: string }>(
        "SELECT id, employee_code, designation FROM staff WHERE tenant_id = $1 AND category_id IS NULL AND deleted_at IS NULL",
        [tenant.id],
      );

      for (const s of staff) {
        const categoryName = matchCategory(s.designation);
        const categoryId = categoryName ? categoryByName.get(categoryName) : undefined;

        if (categoryId) {
          totalMatched++;
          console.log(
            `${apply ? "[applying]" : "[dry run]"} ${tenant.name} / ${s.employee_code}: "${s.designation}" -> ${categoryName}`,
          );
          if (apply) {
            await client.query(
              "UPDATE staff SET category_id = $1, updated_at = $2, version = version + 1 WHERE id = $3",
              [categoryId, now, s.id],
            );
          }
        } else {
          totalUnmatched++;
          console.log(`[no match] ${tenant.name} / ${s.employee_code}: "${s.designation}"`);
        }
      }

      await client.query("COMMIT");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  console.log(`\n${totalMatched} matched${apply ? " and written" : " (dry run, nothing written)"}, ${totalUnmatched} left for manual review.`);
  if (!apply && totalMatched > 0) {
    console.log("Re-run with --apply to write the matches above.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
