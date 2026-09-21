import { randomUUID } from "node:crypto";

import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import type { PoolClient } from "pg";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { findOneForTenant, insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import { staffAllowsAccess } from "../staff/staff-status.js";
import type { CreateStaffLoginDto } from "./dto/create-staff-login.dto.js";
import type { CreateUserDto } from "./dto/create-user.dto.js";

// `roles.manage` is the one permission uniquely granted to the super_admin
// system role among every seeded role (see permission-catalog.ts -- every
// other permission, including users.manage, is also granted to
// branch_admin). BranchScopeGuard already treats holding it as the proxy
// for "this account is meant to see/act tenant-wide" -- the checks below
// reuse the same signal to decide whether an actor outranks a target
// account, rather than name-matching a literal "super_admin" role, so a
// tenant's own custom-named equivalent role is protected identically.
const SUPER_ADMIN_PERMISSION = "roles.manage";

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

  // Reuses the calling transaction's own client rather than
  // ScopedAccessService.hasPermission, which opens its own transaction --
  // nesting that inside the withTransaction callbacks below would hold two
  // pool connections per call for no benefit.
  private async userHasPermission(client: PoolClient, tenantId: string, userId: string, permissionKey: string): Promise<boolean> {
    const result = await client.query(
      `SELECT 1 FROM role_permissions rp
       JOIN user_roles ur ON ur.role_id = rp.role_id AND ur.tenant_id = rp.tenant_id
       WHERE rp.tenant_id = $1 AND ur.user_id = $2 AND rp.permission_key = $3 AND rp.deleted_at IS NULL
       LIMIT 1`,
      [tenantId, userId, permissionKey],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async roleHasPermission(client: PoolClient, tenantId: string, roleId: string, permissionKey: string): Promise<boolean> {
    const result = await client.query(
      "SELECT 1 FROM role_permissions WHERE tenant_id = $1 AND role_id = $2 AND permission_key = $3 AND deleted_at IS NULL",
      [tenantId, roleId, permissionKey],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Guards shared by assignUserRole/removeUserRole/setUserActive: a caller
  // who isn't super-admin-tier themselves (doesn't hold roles.manage)
  // cannot touch a target who already is -- otherwise a branch_admin (who
  // holds users.manage, same as super_admin, but not roles.manage) could
  // deactivate or reassign the roles of a super_admin account despite
  // being outranked by it.
  private async assertNotActingOnSuperiorAccount(
    client: PoolClient,
    tenantId: string,
    actorUserId: string,
    targetUserId: string,
  ): Promise<void> {
    const targetIsProtected = await this.userHasPermission(client, tenantId, targetUserId, SUPER_ADMIN_PERMISSION);
    if (!targetIsProtected) return;
    const actorIsPeer = await this.userHasPermission(client, tenantId, actorUserId, SUPER_ADMIN_PERMISSION);
    if (!actorIsPeer) {
      throw new ForbiddenException("Only another super-admin-tier user can change this account's roles or status.");
    }
  }

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

  async resetPassword(
    tenantId: string,
    actorUserId: string,
    userId: string,
    newPassword: string,
    branchId?: string | null,
  ): Promise<void> {
    return this.db.withTransaction(tenantId, async (client) => {
      const user = await findOneForTenant<UserRow>(client, "users", tenantId, userId, branchId);
      if (!user) {
        throw new NotFoundException("user not found");
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await updateRow<UserRow>(client, "users", tenantId, userId, { password_hash: passwordHash }, branchId);

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

  async assignUserRole(
    tenantId: string,
    actorUserId: string,
    userId: string,
    roleId: string,
    branchId?: string | null,
  ) {
    await this.db.withTransaction(tenantId, async (client) => {
      // A user cannot change their own role assignments -- self-service
      // escalation (granting yourself a broader role) and self-service
      // demotion (accidentally locking yourself out) both go through
      // another admin instead.
      if (userId === actorUserId) {
        throw new ForbiddenException("You cannot change your own role assignments.");
      }

      const user = await findOneForTenant<UserRow>(client, "users", tenantId, userId, branchId);
      if (!user) {
        throw new NotFoundException("user not found");
      }

      await this.assertNotActingOnSuperiorAccount(client, tenantId, actorUserId, userId);

      // Also block granting a role that itself carries roles.manage --
      // otherwise a branch_admin (who holds users.manage but not
      // roles.manage) could promote some other account to super-admin
      // tier despite not being allowed to touch one directly above.
      const roleGrantsSuperAdmin = await this.roleHasPermission(client, tenantId, roleId, SUPER_ADMIN_PERMISSION);
      if (roleGrantsSuperAdmin) {
        const actorIsSuperAdmin = await this.userHasPermission(client, tenantId, actorUserId, SUPER_ADMIN_PERMISSION);
        if (!actorIsSuperAdmin) {
          throw new ForbiddenException("Only a super-admin-tier user can grant this role.");
        }
      }

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

  async removeUserRole(
    tenantId: string,
    actorUserId: string,
    userId: string,
    roleId: string,
    branchId?: string | null,
  ) {
    await this.db.withTransaction(tenantId, async (client) => {
      // Same self-service restriction as assignUserRole -- see there.
      if (userId === actorUserId) {
        throw new ForbiddenException("You cannot change your own role assignments.");
      }

      const user = await findOneForTenant<UserRow>(client, "users", tenantId, userId, branchId);
      if (!user) {
        throw new NotFoundException("user not found");
      }

      await this.assertNotActingOnSuperiorAccount(client, tenantId, actorUserId, userId);

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

  async setUserActive(
    tenantId: string,
    actorUserId: string,
    userId: string,
    isActive: boolean,
    branchId?: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      await this.assertNotActingOnSuperiorAccount(client, tenantId, actorUserId, userId);

      const now = new Date();
      const updated = await updateRow<UserRow>(
        client,
        "users",
        tenantId,
        userId,
        {
          is_active: isActive,
          updated_at: now,
        },
        branchId,
      );

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
