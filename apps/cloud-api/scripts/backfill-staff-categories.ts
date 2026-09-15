// One-off, reviewed backfill: best-effort maps existing Staff.designation
// free text to the new StaffCategory lookup rows added alongside it (see
// prisma/schema.prisma's Staff.categoryId). Deliberately NOT run automatically
// by the migration or seed script -- run by hand, review the printed matches,
// then re-run with --apply to write them.
//
// Usage:
//   pnpm exec tsx scripts/backfill-staff-categories.ts            # dry run, prints matches only
//   pnpm exec tsx scripts/backfill-staff-categories.ts --apply    # writes categoryId for matched rows
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let totalMatched = 0;
  let totalUnmatched = 0;

  for (const tenant of tenants) {
    const categories = await prisma.staffCategory.findMany({ where: { tenantId: tenant.id, deletedAt: null } });
    const categoryByName = new Map(categories.map((c) => [c.name, c.id]));

    const staff = await prisma.staff.findMany({
      where: { tenantId: tenant.id, categoryId: null, deletedAt: null },
      select: { id: true, employeeCode: true, designation: true },
    });

    for (const s of staff) {
      const categoryName = matchCategory(s.designation);
      const categoryId = categoryName ? categoryByName.get(categoryName) : undefined;

      if (categoryId) {
        totalMatched++;
        console.log(
          `${apply ? "[applying]" : "[dry run]"} ${tenant.name} / ${s.employeeCode}: "${s.designation}" -> ${categoryName}`,
        );
        if (apply) {
          await prisma.staff.update({
            where: { id: s.id },
            data: { categoryId, updatedAt: now, version: { increment: 1 } },
          });
        }
      } else {
        totalUnmatched++;
        console.log(`[no match] ${tenant.name} / ${s.employeeCode}: "${s.designation}"`);
      }
    }
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
    await prisma.$disconnect();
  });
