// Dev/demo seed script. Creates a tenant/branch/admin user with fixed,
// well-known ids for local development. Production tenants come from the
// (future) school signup/provisioning flow instead, with random UUIDs.
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

import { SYSTEM_ROLE_PERMISSIONS } from "../src/common/permission-catalog.js";

const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_BRANCH_ID = "00000000-0000-0000-0000-000000000002";
const DEMO_ADMIN_EMAIL = "admin@demo.vidyalaya.in";
const DEMO_ADMIN_PASSWORD = "vidyalaya-demo";

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
        update: { deletedAt: null },
        create: {
          id: randomUUID(),
          tenantId: tenant.id,
          roleId: role.id,
          permissionKey,
          updatedAt: now,
        },
      });
    }

    // Reconcile: soft-delete any grant this system role no longer has in
    // permission-catalog.ts (e.g. a renamed/split key from a past catalog
    // change) so re-seeding never leaves stale RolePermission rows behind.
    const currentKeys = new Set(defaultRole.permissions);
    const existingGrants = await prisma.rolePermission.findMany({
      where: { roleId: role.id, deletedAt: null },
    });
    for (const grant of existingGrants) {
      if (!currentKeys.has(grant.permissionKey)) {
        await prisma.rolePermission.update({
          where: { id: grant.id },
          data: { deletedAt: now, updatedAt: now, version: { increment: 1 } },
        });
      }
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
