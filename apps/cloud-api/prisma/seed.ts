// Dev/demo seed script. Creates a tenant/branch/admin user using the same
// fixed well-known ids as apps/desktop/src-tauri/src/seed.rs, so a local
// cloud-api and a local desktop install can be used together to manually
// verify the sync engine end to end. Production tenants come from the
// (future) school signup/provisioning flow instead, with random UUIDs.
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_BRANCH_ID = "00000000-0000-0000-0000-000000000002";
const DEMO_ADMIN_EMAIL = "admin@demo.vidyalaya.in";
const DEMO_ADMIN_PASSWORD = "vidyalaya-demo";

// Matches apps/desktop/src-tauri/src/seed.rs exactly (fixed ids, same reason
// as DEMO_TENANT_ID/DEMO_BRANCH_ID above: both sides seed the same tenant
// independently, and `roles` has a UNIQUE (tenant_id, name) constraint).
const DEMO_ROLE_SUPER_ADMIN_ID = "00000000-0000-0000-0000-000000000010";
const DEMO_ROLE_BRANCH_ADMIN_ID = "00000000-0000-0000-0000-000000000011";
const DEMO_ROLE_ACCOUNTANT_ID = "00000000-0000-0000-0000-000000000012";
const DEMO_ROLE_TEACHER_ID = "00000000-0000-0000-0000-000000000013";
const DEMO_ROLE_FRONT_DESK_ID = "00000000-0000-0000-0000-000000000014";

// Mirrors apps/desktop/src-tauri/src/models.rs PERMISSION_CATALOG -- kept in
// sync by hand across Rust/TS, same convention as SYNCABLE_TABLES.
const PERMISSION_CATALOG = [
  "students.view", "students.create", "students.edit", "students.delete",
  "admissions.view", "admissions.create", "admissions.confirm",
  "attendance.mark", "attendance.view",
  "fees.view", "fees.manage", "fees.record_payment",
  "exams.view", "exams.manage", "exams.enter_marks",
  "houses.view", "houses.manage",
  "library.view", "library.manage",
  "transport.view", "transport.manage",
  "staff.view", "staff.manage",
  "staff_attendance.mark", "staff_attendance.view",
  "payroll.view", "payroll.view_own", "payroll.generate", "payroll.finalize",
  "academic_setup.view", "academic_setup.manage", "academic_setup.promote",
  "roles.manage", "users.manage",
  "audit.view",
  "module_settings.manage",
];

const DEFAULT_ROLES: { id: string; name: string; permissions: string[] }[] = [
  { id: DEMO_ROLE_SUPER_ADMIN_ID, name: "super_admin", permissions: PERMISSION_CATALOG },
  {
    id: DEMO_ROLE_BRANCH_ADMIN_ID,
    name: "branch_admin",
    permissions: PERMISSION_CATALOG.filter((k) => k !== "roles.manage"),
  },
  {
    id: DEMO_ROLE_ACCOUNTANT_ID,
    name: "accountant",
    permissions: [
      "fees.view", "fees.manage", "fees.record_payment",
      "payroll.view", "payroll.generate", "payroll.finalize",
      "students.view",
    ],
  },
  {
    id: DEMO_ROLE_TEACHER_ID,
    name: "teacher",
    permissions: [
      "attendance.mark", "attendance.view", "exams.view", "exams.enter_marks",
      "students.view", "staff_attendance.view", "payroll.view_own",
    ],
  },
  {
    id: DEMO_ROLE_FRONT_DESK_ID,
    name: "front_desk",
    permissions: [
      "admissions.view", "admissions.create", "admissions.confirm",
      "students.view", "students.create", "students.edit",
      "library.view", "library.manage",
    ],
  },
];

const prisma = new PrismaClient();

async function main() {
  const now = new Date();

  const tenant = await prisma.tenant.upsert({
    where: { id: DEMO_TENANT_ID },
    update: {},
    create: {
      id: DEMO_TENANT_ID,
      name: "Demo Vidyalaya School",
      subscriptionStatus: "trial",
    },
  });

  const branch = await prisma.branch.upsert({
    where: { id: DEMO_BRANCH_ID },
    update: {},
    create: {
      id: DEMO_BRANCH_ID,
      tenantId: tenant.id,
      name: "Main Campus",
      code: "MAIN",
      city: "New Delhi",
      updatedAt: now,
    },
  });

  for (const defaultRole of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { id: defaultRole.id },
      update: {},
      create: {
        id: defaultRole.id,
        tenantId: tenant.id,
        name: defaultRole.name,
        isSystem: true,
        updatedAt: now,
      },
    });

    for (const permissionKey of defaultRole.permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionKey: { roleId: role.id, permissionKey } },
        update: {},
        create: {
          id: randomUUID(),
          tenantId: tenant.id,
          roleId: role.id,
          permissionKey,
          updatedAt: now,
        },
      });
    }
  }

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { id: DEMO_ROLE_SUPER_ADMIN_ID } });

  const passwordHash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: DEMO_ADMIN_EMAIL } },
    update: { passwordHash },
    create: {
      id: randomUUID(),
      tenantId: tenant.id,
      fullName: "Demo Admin",
      email: DEMO_ADMIN_EMAIL,
      passwordHash,
      updatedAt: now,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    update: {},
    create: {
      id: randomUUID(),
      tenantId: tenant.id,
      userId: user.id,
      roleId: superAdminRole.id,
      updatedAt: now,
    },
  });

  // So a fresh desktop install (one that didn't locally seed this branch
  // itself) picks it up on its first pull.
  const existingBranchLog = await prisma.syncLog.findFirst({
    where: { tenantId: tenant.id, entityTable: "branches", entityId: branch.id },
  });
  if (!existingBranchLog) {
    await prisma.syncLog.create({
      data: {
        tenantId: tenant.id,
        entityTable: "branches",
        entityId: branch.id,
        op: "insert",
        payload: {
          id: branch.id,
          tenant_id: tenant.id,
          name: branch.name,
          code: branch.code,
          city: branch.city,
          is_active: true,
          updated_at: now.toISOString(),
          version: 1,
        },
      },
    });
  }

  console.log("Seeded demo tenant:", tenant.id);
  console.log("Login with:", DEMO_ADMIN_EMAIL, "/", DEMO_ADMIN_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
