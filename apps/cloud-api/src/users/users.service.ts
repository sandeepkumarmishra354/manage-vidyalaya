import { randomUUID } from "node:crypto";

import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateStaffLoginDto } from "./dto/create-staff-login.dto.js";
import type { CreateUserDto } from "./dto/create-user.dto.js";

/// `password_hash` is only ever set server-side -- the frontend never
/// computes or stores one, it only submits a plaintext password over HTTPS
/// on create/reset.
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

    return { id: user.id };
  }

  async resetPassword(tenantId: string, actorUserId: string, userId: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("user not found");
    }
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException("Cannot reset a password for another tenant's user");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    await this.audit.record(this.prisma, {
      tenantId,
      actorUserId,
      entityTable: "users",
      entityId: userId,
      action: "update",
      summary: "Reset password",
    });
  }

  async listUsers(tenantId: string, search?: string, roleId?: string) {
    const term = (search ?? "").trim();
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(roleId ? { userRoles: { some: { roleId } } } : {}),
        ...(term
          ? {
              OR: [
                { fullName: { contains: term, mode: "insensitive" } },
                { email: { contains: term, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { userRoles: true },
      orderBy: { fullName: "asc" },
    });

    return users.map((u) => ({
      id: u.id,
      full_name: u.fullName,
      email: u.email,
      is_active: u.isActive,
      role_ids: u.userRoles.map((ur) => ur.roleId),
    }));
  }

  async assignUserRole(tenantId: string, actorUserId: string, userId: string, roleId: string) {
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { id: randomUUID(), tenantId, userId, roleId, updatedAt: new Date() },
      update: {},
    });

    await this.audit.record(this.prisma, {
      tenantId,
      actorUserId,
      entityTable: "user_roles",
      entityId: userId,
      action: "update",
      summary: "Assigned role",
    });
  }

  async removeUserRole(tenantId: string, actorUserId: string, userId: string, roleId: string) {
    await this.prisma.userRole.deleteMany({ where: { userId, roleId } });

    await this.audit.record(this.prisma, {
      tenantId,
      actorUserId,
      entityTable: "user_roles",
      entityId: userId,
      action: "delete",
      summary: "Removed role",
    });
  }

  async setUserActive(tenantId: string, actorUserId: string, userId: string, isActive: boolean) {
    const now = new Date();
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive, updatedAt: now, version: { increment: 1 } },
    });

    await this.audit.record(this.prisma, {
      tenantId,
      actorUserId,
      entityTable: "users",
      entityId: userId,
      action: "update",
      summary: isActive ? "Reactivated user" : "Deactivated user",
    });

    return updated;
  }

  // Creates a login (a users row with a password) for an existing staff
  // member, then links staff.user_id. Now a single local transaction --
  // the old desktop flow needed a cloud-api round trip plus a local write
  // because the desktop app couldn't set password_hash itself; cloud-api
  // is the only writer now, so that split no longer applies.
  async createStaffLogin(tenantId: string, actorUserId: string, dto: CreateStaffLoginDto) {
    const passwordHash = await bcrypt.hash(dto.initial_password, 10);
    const now = new Date();
    const userId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: userId,
          tenantId,
          branchId: dto.branch_id ?? null,
          fullName: dto.full_name,
          email: dto.email,
          passwordHash,
          isActive: true,
          updatedAt: now,
        },
      });

      await tx.staff.update({
        where: { id: dto.staff_id },
        data: { userId: user.id, updatedAt: now, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "staff",
        entityId: dto.staff_id,
        action: "update",
        summary: "Created login for staff member",
      });

      return { id: user.id };
    });
  }
}
