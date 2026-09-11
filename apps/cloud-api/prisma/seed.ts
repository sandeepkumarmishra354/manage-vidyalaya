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

  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "super_admin" } },
    update: {},
    create: {
      id: randomUUID(),
      tenantId: tenant.id,
      name: "super_admin",
      updatedAt: now,
    },
  });

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
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: {
      id: randomUUID(),
      tenantId: tenant.id,
      userId: user.id,
      roleId: role.id,
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
