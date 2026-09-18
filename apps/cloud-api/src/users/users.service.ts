import { randomUUID } from "node:crypto";

import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { findOneForTenant, insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import { staffAllowsAccess } from "../staff/staff-status.js";
import type { CreateStaffLoginDto } from "./dto/create-staff-login.dto.js";
import type { CreateUserDto } from "./dto/create-user.dto.js";

export interface UserRow extends TenantRow {
  full_name: string;
  email: string;
  is_active: boolean;
}

interface StaffRow extends TenantRow {
  status: string;
}

/// `password_hash` is only ever set server-side -- the frontend never
/// computes or stores one, it only submits a plaintext password over HTTPS
/// on create/reset.
@Injectable()
export class UsersService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async createUser(callerTenantId: string, dto: CreateUserDto): Promise<{ id: string }> {
    if (callerTenantId !== dto.tenant_id) {
      throw new ForbiddenException("Cannot create a user for another tenant");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const now = new Date();

    return this.db.withTransaction(dto.tenant_id, async (client) => {
      const user = await insertRow<UserRow>(client, "users", dto.tenant_id, {
        branch_id: dto.branch_id ?? null,
        full_name: dto.full_name,
        email: dto.email,
        password_hash: passwordHash,
        is_active: true,
        updated_at: now,
      });
      return { id: user.id };
    });
  }

  async resetPassword(tenantId: string, actorUserId: string, userId: string, newPassword: string): Promise<void> {
    return this.db.withTransaction(tenantId, async (client) => {
      const user = await findOneForTenant<UserRow>(client, "users", tenantId, userId);
      if (!user) {
        throw new NotFoundException("user not found");
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await updateRow<UserRow>(client, "users", tenantId, userId, { password_hash: passwordHash });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "users",
        entityId: userId,
        action: "update",
        summary: "Reset password",
      });
    });
  }

  async listUsers(tenantId: string, search?: string, roleId?: string) {
    const term = (search ?? "").trim();
    const conditions = ["u.tenant_id = $1", "u.deleted_at IS NULL"];
    const values: unknown[] = [tenantId];

    if (roleId) {
      values.push(roleId);
      conditions.push(`EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = $${values.length})`);
    }
    if (term) {
      values.push(`%${term}%`);
      conditions.push(`(u.full_name ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
    }

    const rows = await this.db.query<UserRow & { role_ids: string[] | null }>(
      tenantId,
      `SELECT u.*, array_remove(array_agg(ur.role_id), NULL) AS role_ids
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE ${conditions.join(" AND ")}
       GROUP BY u.id
       ORDER BY u.full_name ASC`,
      values,
    );

    return rows.map((u) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      is_active: u.is_active,
      role_ids: u.role_ids ?? [],
    }));
  }

  async assignUserRole(tenantId: string, actorUserId: string, userId: string, roleId: string) {
    await this.db.withTransaction(tenantId, async (client) => {
      await client.query(
        `INSERT INTO user_roles (id, tenant_id, user_id, role_id, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [randomUUID(), tenantId, userId, roleId, new Date()],
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "user_roles",
        entityId: userId,
        action: "update",
        summary: "Assigned role",
      });
    });
  }

  async removeUserRole(tenantId: string, actorUserId: string, userId: string, roleId: string) {
    await this.db.withTransaction(tenantId, async (client) => {
      await client.query("DELETE FROM user_roles WHERE tenant_id = $1 AND user_id = $2 AND role_id = $3", [
        tenantId,
        userId,
        roleId,
      ]);

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "user_roles",
        entityId: userId,
        action: "delete",
        summary: "Removed role",
      });
    });
  }

  async setUserActive(tenantId: string, actorUserId: string, userId: string, isActive: boolean) {
    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      const updated = await updateRow<UserRow>(client, "users", tenantId, userId, {
        is_active: isActive,
        updated_at: now,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "users",
        entityId: userId,
        action: "update",
        summary: isActive ? "Reactivated user" : "Deactivated user",
      });

      return updated;
    });
  }

  // Creates a login (a users row with a password) for an existing staff
  // member, then links staff.user_id. Now a single local transaction --
  // the old desktop flow needed a cloud-api round trip plus a local write
  // because the desktop app couldn't set password_hash itself; cloud-api
  // is the only writer now, so that split no longer applies.
  async createStaffLogin(tenantId: string, actorUserId: string, dto: CreateStaffLoginDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const staff = await findOneForTenant<StaffRow>(client, "staff", tenantId, dto.staff_id);
      if (!staff) {
        throw new NotFoundException("staff member not found");
      }
      if (!staffAllowsAccess(staff.status)) {
        throw new ForbiddenException("Cannot create a login for a staff member who isn't active.");
      }

      const passwordHash = await bcrypt.hash(dto.initial_password, 10);
      const now = new Date();

      const user = await insertRow<UserRow>(client, "users", tenantId, {
        branch_id: dto.branch_id ?? null,
        full_name: dto.full_name,
        email: dto.email,
        password_hash: passwordHash,
        is_active: true,
        updated_at: now,
      });

      await updateRow<StaffRow>(client, "staff", tenantId, dto.staff_id, {
        user_id: user.id,
        updated_at: now,
      });

      await this.audit.record(client, {
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
