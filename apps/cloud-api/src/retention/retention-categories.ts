// Shared source for the fixed set of retention categories -- read by
// RetentionService (lazy-seed + validation), scripts/seed.ts,
// scripts/create-tenant.ts, and scripts/run-retention.ts, so the category
// list and its starting defaults live in exactly one place.
//
// `financial_records` (payroll, fee payments) and `academic_records`
// (exam marks) are seeded `is_active: false` deliberately -- their correct
// retention periods depend on the Income Tax Act, Companies Act, and
// state education-board rules, which need confirmation from the school's
// own legal/compliance advisor before any code redacts or deletes them.
// The `retention_years` values below are editable starting points, not
// legal advice.
export const RETENTION_CATEGORIES = [
  "student_identity",
  "staff_identity",
  "financial_records",
  "academic_records",
] as const;

export type RetentionCategory = (typeof RETENTION_CATEGORIES)[number];

export function isRetentionCategory(value: string): value is RetentionCategory {
  return (RETENTION_CATEGORIES as readonly string[]).includes(value);
}

export const DEFAULT_RETENTION_POLICIES: {
  category: RetentionCategory;
  retention_years: number;
  is_active: boolean;
}[] = [
  { category: "student_identity", retention_years: 3, is_active: true },
  { category: "staff_identity", retention_years: 3, is_active: true },
  { category: "financial_records", retention_years: 8, is_active: false },
  { category: "academic_records", retention_years: 10, is_active: false },
];
