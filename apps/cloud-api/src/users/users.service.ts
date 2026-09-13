import { randomUUID } from "node:crypto";

import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";

import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateUserDto } from "./dto/create-user.dto.js";

/// Creating a login (a `users` row with a password) and resetting a password
/// are the two operations that must go through cloud-api rather than the
/// desktop's regular offline-write path, since `password_hash` is set
/// server-side only -- the desktop app never computes or stores one (see
/// `users.password_hash` comment in packages/db-schema/migrations/0001_core.sql).
/// Everything else about a user (full_name, is_active, role assignment) is a
/// regular synced write from desktop, handled by
/// apps/desktop/src-tauri/src/commands/rbac.rs.
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(callerTenantId: string, dto: CreateUserDto): Promise<{ id: string }> {
    if (callerTenantId !== dto.tenant_id) {
      throw new ForbiddenException("Cannot create a user for another tenant");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const now = new Date();

    const user = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        tenantId: dto.tenant_id,
        branchId: dto.branch_id ?? null,
        fullName: dto.full_name,
        email: dto.email,
        passwordHash,
        isActive: true,
        updatedAt: now,
      },
    });

    // Visible to the desktop's sync pull immediately, same as any other
    // relationally-mirrored write coming from the opposite direction (see
    // SyncService.mirrorRelationalTable) -- without this, a freshly-created
    // login wouldn't appear on the device that requested it until some
    // *other* change happened to trigger a sync_log row for this user.
    await this.prisma.syncLog.create({
      data: {
        tenantId: dto.tenant_id,
        entityTable: "users",
        entityId: user.id,
        op: "insert",
        payload: {
          id: user.id,
          tenant_id: dto.tenant_id,
          branch_id: dto.branch_id ?? null,
          full_name: dto.full_name,
          email: dto.email,
          phone: null,
          password_hash: null, // never replicated to desktop
          is_active: true,
          updated_at: now.toISOString(),
          version: 1,
        },
      },
    });

    return { id: user.id };
  }

  async resetPassword(callerTenantId: string, userId: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("user not found");
    }
    if (user.tenantId !== callerTenantId) {
      throw new ForbiddenException("Cannot reset a password for another tenant's user");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }
}
