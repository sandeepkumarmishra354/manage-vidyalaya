import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateRoleDto } from "./dto/create-role.dto.js";
import type { SetRolePermissionsDto } from "./dto/set-role-permissions.dto.js";
import type { UpdateRoleDto } from "./dto/update-role.dto.js";

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listRoles(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async createRole(tenantId: string, actorUserId: string, dto: CreateRoleDto) {
    const id = randomUUID();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: { id, tenantId, name: dto.name, isSystem: false, updatedAt: now },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "roles",
        entityId: id,
        action: "create",
        summary: `Created role '${dto.name}'`,
      });

      return role;
    });
  }

  async updateRole(tenantId: string, actorUserId: string, id: string, dto: UpdateRoleDto) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.role.update({
        where: { id },
        data: { name: dto.name, updatedAt: now, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "roles",
        entityId: id,
        action: "update",
        summary: `Renamed role to '${dto.name}'`,
      });

      return updated;
    });
  }

  // System roles (seeded at provisioning: super_admin, branch_admin,
  // accountant, teacher, front_desk) can't be deleted -- other code paths
  // (default role assignment during staff onboarding) assume they exist.
  async deleteRole(tenantId: string, actorUserId: string, id: string) {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { id } });
    if (role.isSystem) {
      throw new BadRequestException("cannot delete a system role");
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.role.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "roles",
        entityId: id,
        action: "delete",
        summary: "Deleted role",
      });

      return deleted;
    });
  }

  async listRolePermissions(roleId: string) {
    const grants = await this.prisma.rolePermission.findMany({
      where: { roleId, deletedAt: null },
      select: { permissionKey: true },
    });
    return grants.map((g) => g.permissionKey);
  }

  // Replaces the full permission set for a role: deletes any granted keys
  // not in the new set, inserts any new ones.
  async setRolePermissions(tenantId: string, actorUserId: string, roleId: string, dto: SetRolePermissionsDto) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.rolePermission.findMany({
        where: { roleId, deletedAt: null },
      });

      const toRemove = existing.filter((g) => !dto.permission_keys.includes(g.permissionKey));
      for (const grant of toRemove) {
        await tx.rolePermission.update({
          where: { id: grant.id },
          data: { deletedAt: now, updatedAt: now, version: { increment: 1 } },
        });
      }

      const existingKeys = new Set(existing.map((g) => g.permissionKey));
      const toAdd = dto.permission_keys.filter((key) => !existingKeys.has(key));
      for (const key of toAdd) {
        await tx.rolePermission.create({
          data: { id: randomUUID(), tenantId, roleId, permissionKey: key, updatedAt: now },
        });
      }

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "roles",
        entityId: roleId,
        action: "update",
        summary: `Set permissions for role (${dto.permission_keys.length} keys)`,
      });
    });
  }
}
