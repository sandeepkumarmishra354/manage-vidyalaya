import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { findManyForTenant, findOneForTenant, insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { CreateRoleDto } from "./dto/create-role.dto.js";
import type { SetRolePermissionsDto } from "./dto/set-role-permissions.dto.js";
import type { UpdateRoleDto } from "./dto/update-role.dto.js";

export interface RoleRow extends TenantRow {
  name: string;
  is_system: boolean;
}

interface RolePermissionRow extends TenantRow {
  role_id: string;
  permission_key: string;
}

@Injectable()
export class RolesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  listRoles(tenantId: string) {
    return this.db.withTransaction(tenantId, (client) =>
      findManyForTenant<RoleRow>(client, "roles", tenantId, {}, "name ASC"),
    );
  }

  async createRole(tenantId: string, actorUserId: string, dto: CreateRoleDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const role = await insertRow<RoleRow>(client, "roles", tenantId, {
        name: dto.name,
        is_system: false,
        updated_at: new Date(),
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "roles",
        entityId: role.id,
        action: "create",
        summary: `Created role '${dto.name}'`,
      });

      return role;
    });
  }

  async updateRole(tenantId: string, actorUserId: string, id: string, dto: UpdateRoleDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<RoleRow>(client, "roles", tenantId, id, {
        name: dto.name,
        updated_at: new Date(),
      });

      await this.audit.record(client, {
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
    return this.db.withTransaction(tenantId, async (client) => {
      const role = await findOneForTenant<RoleRow>(client, "roles", tenantId, id);
      if (!role) {
        throw new NotFoundException("role not found");
      }
      if (role.is_system) {
        throw new BadRequestException("cannot delete a system role");
      }

      // Role has no updated_by column (unlike most soft-deletable tables in
      // this schema), so this can't go through the generic softDeleteRow
      // helper -- set deleted_at directly instead.
      const deleted = await updateRow<RoleRow>(client, "roles", tenantId, id, { deleted_at: new Date() });

      await this.audit.record(client, {
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

  async listRolePermissions(tenantId: string, roleId: string) {
    const grants = await this.db.query<{ permission_key: string }>(
      tenantId,
      "SELECT permission_key FROM role_permissions WHERE tenant_id = $1 AND role_id = $2 AND deleted_at IS NULL",
      [tenantId, roleId],
    );
    return grants.map((g) => g.permission_key);
  }

  // Replaces the full permission set for a role: deletes any granted keys
  // not in the new set, inserts any new ones.
  async setRolePermissions(tenantId: string, actorUserId: string, roleId: string, dto: SetRolePermissionsDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      const existing = await findManyForTenant<RolePermissionRow>(client, "role_permissions", tenantId, {
        role_id: roleId,
      });

      const toRemove = existing.filter((g) => !dto.permission_keys.includes(g.permission_key));
      for (const grant of toRemove) {
        await updateRow<RolePermissionRow>(client, "role_permissions", tenantId, grant.id, { deleted_at: now });
      }

      const existingKeys = new Set(existing.map((g) => g.permission_key));
      const toAdd = dto.permission_keys.filter((key) => !existingKeys.has(key));
      for (const key of toAdd) {
        await insertRow<RolePermissionRow>(client, "role_permissions", tenantId, {
          id: randomUUID(),
          role_id: roleId,
          permission_key: key,
          updated_at: now,
        });
      }

      await this.audit.record(client, {
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
