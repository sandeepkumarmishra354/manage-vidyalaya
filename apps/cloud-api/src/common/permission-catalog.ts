// Single source of truth for permission keys, enforced by PermissionsGuard +
// @RequirePermission on every guarded route. Previously duplicated between
// Rust (models.rs PERMISSION_CATALOG) and TS by hand; now that cloud-api is
// the sole backend, this is the only copy.
export const PERMISSION_CATALOG = [
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
  "fees.manage",
  "fees.record_payment",
  "exams.view",
  "exams.manage",
  "exams.enter_marks",
  "houses.view",
  "houses.manage",
  "library.view",
  "library.manage",
  "transport.view",
  "transport.manage",
  "staff.view",
  "staff.manage",
  "staff_attendance.mark",
  "staff_attendance.view",
  "payroll.view",
  "payroll.view_own",
  "payroll.generate",
  "payroll.finalize",
  "academic_setup.view",
  "academic_setup.manage",
  "academic_setup.promote",
  "roles.manage",
  "users.manage",
  "audit.view",
  "module_settings.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number];

export const TOGGLEABLE_MODULES = [
  "attendance",
  "fees",
  "exams",
  "library",
  "transport",
  "houses",
  "id_cards",
  "payroll",
] as const;

export type ToggleableModule = (typeof TOGGLEABLE_MODULES)[number];

// System roles seeded for every new tenant, each with a fixed permission
// set (matches prisma/seed.ts's DEFAULT_ROLES exactly -- this is the shared
// source both read from). Custom roles an admin creates via RolesModule are
// unrestricted.
export const SYSTEM_ROLE_PERMISSIONS: Record<string, readonly PermissionKey[]> = {
  super_admin: PERMISSION_CATALOG,
  branch_admin: PERMISSION_CATALOG.filter((key) => key !== "roles.manage"),
  accountant: [
    "fees.view",
    "fees.manage",
    "fees.record_payment",
    "payroll.view",
    "payroll.generate",
    "payroll.finalize",
    "students.view",
  ],
  teacher: [
    "attendance.mark",
    "attendance.view",
    "exams.view",
    "exams.enter_marks",
    "students.view",
    "staff_attendance.view",
    "payroll.view_own",
  ],
  front_desk: [
    "admissions.view",
    "admissions.create",
    "admissions.confirm",
    "students.view",
    "students.create",
    "students.edit",
    "library.view",
    "library.manage",
  ],
};
