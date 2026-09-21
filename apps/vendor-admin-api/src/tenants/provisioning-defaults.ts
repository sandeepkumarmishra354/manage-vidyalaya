// Duplicated from apps/cloud-api's permission-catalog.ts (SYSTEM_ROLE_
// PERMISSIONS/PERMISSION_CATALOG), fees/fee-type.ts, leave-types/default-
// leave-types.ts, and retention/retention-categories.ts -- those copies
// are the source of truth (used by scripts/create-tenant.ts and
// scripts/seed.ts); keep this file in sync with them by hand. Needed here
// so TenantsService.createTenant can provision a new tenant the exact
// same way create-tenant.ts does, without a cross-app source import.

const PERMISSION_CATALOG = [
  "students.view",
  "students.create",
  "students.edit",
  "students.delete",
  "admissions.view",
  "admissions.create",
  "admissions.confirm",
  "attendance.mark",
  "attendance.view",
  "fees.view",
  "fees.manage_structures",
  "fees.generate_invoices",
  "fees.void_invoice",
  "fees.record_payment",
  "fees.manage_discounts",
  "exams.view",
  "exams.manage_subjects",
  "exams.manage_exams",
  "exams.enter_marks",
  "houses.view",
  "houses.manage_teams",
  "houses.manage_points",
  "library.view",
  "library.manage_catalog",
  "library.manage_issues",
  "transport.view",
  "transport.manage_routes",
  "transport.manage_assignments",
  "staff.view",
  "staff.manage_profile",
  "staff.manage_assignments",
  "staff_attendance.mark",
  "staff_attendance.view",
  "staff_leave.manage",
  "payroll.view",
  "payroll.view_own",
  "payroll.manage_salary_structure",
  "payroll.generate",
  "payroll.finalize",
  "payroll.manage_runs",
  "academic_setup.view",
  "academic_setup.manage_school_details",
  "academic_setup.manage_sessions",
  "academic_setup.manage_classes",
  "academic_setup.manage_sections",
  "academic_setup.promote",
  "master_data.view",
  "master_data.manage_gender",
  "master_data.manage_blood_group",
  "master_data.manage_religion",
  "master_data.manage_nationality",
  "master_data.manage_mother_tongue",
  "master_data.manage_student_category",
  "master_data.manage_guardian_relation",
  "master_data.manage_staff_category",
  "master_data.manage_leave_type",
  "master_data.manage_fee_category",
  "master_data.manage_expense_category",
  "roles.manage",
  "users.manage",
  "audit.view",
  "data_retention.manage",
  "expenses.view",
  "expenses.manage",
  "timetable.view",
  "timetable.manage",
] as const;

export const SYSTEM_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  super_admin: PERMISSION_CATALOG,
  branch_admin: PERMISSION_CATALOG.filter((key) => key !== "roles.manage"),
  accountant: [
    "fees.view",
    "fees.manage_structures",
    "fees.generate_invoices",
    "fees.void_invoice",
    "fees.record_payment",
    "fees.manage_discounts",
    "payroll.view",
    "payroll.generate",
    "payroll.finalize",
    "students.view",
    "expenses.view",
    "expenses.manage",
  ],
  teacher: [
    "attendance.mark",
    "attendance.view",
    "exams.view",
    "exams.enter_marks",
    "students.view",
    "staff_attendance.view",
    "payroll.view_own",
    "timetable.view",
  ],
  front_desk: [
    "admissions.view",
    "admissions.create",
    "admissions.confirm",
    "students.view",
    "students.create",
    "students.edit",
    "library.view",
    "library.manage_issues",
  ],
};

export const SYSTEM_ROLE_NAMES = ["super_admin", "branch_admin", "accountant", "teacher", "front_desk"] as const;

export const DEFAULT_STAFF_CATEGORIES = [
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

const FEE_TYPES = ["tuition", "transport", "library", "exam", "hostel", "admission", "other"] as const;

export const DEFAULT_FEE_CATEGORIES: { key: string; name: string }[] = FEE_TYPES.map((key) => ({
  key,
  name: key.charAt(0).toUpperCase() + key.slice(1),
}));

export const DEFAULT_MASTER_DATA_ITEMS: { type: string; name: string }[] = [
  ...["General", "OBC", "SC", "ST", "Other"].map((name) => ({ type: "student_category", name })),
  ...["Male", "Female", "Other"].map((name) => ({ type: "gender", name })),
  ...["Father", "Mother", "Guardian"].map((name) => ({ type: "guardian_relation", name })),
  ...["Utilities", "Stationery", "Maintenance", "Transport & Fuel", "Miscellaneous"].map((name) => ({
    type: "expense_category",
    name,
  })),
];

export const DEFAULT_LEAVE_TYPES: { name: string; quotaEnabled: boolean }[] = [
  { name: "Casual Leave", quotaEnabled: true },
  { name: "Sick Leave", quotaEnabled: true },
  { name: "Other", quotaEnabled: false },
];

export const DEFAULT_RETENTION_POLICIES: { category: string; retention_years: number; is_active: boolean }[] = [
  { category: "student_identity", retention_years: 3, is_active: true },
  { category: "staff_identity", retention_years: 3, is_active: true },
  { category: "financial_records", retention_years: 8, is_active: false },
  { category: "academic_records", retention_years: 10, is_active: false },
];

// Indian academic year convention: April-to-March, copied from
// scripts/create-tenant.ts.
export function currentAcademicYearBounds(now: Date): { name: string; startDate: Date; endDate: Date } {
  const aprilIndex = 3;
  const startYear = now.getUTCMonth() >= aprilIndex ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return {
    name: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
    startDate: new Date(Date.UTC(startYear, aprilIndex, 1)),
    endDate: new Date(Date.UTC(startYear + 1, aprilIndex, 0)),
  };
}
