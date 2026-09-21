import { randomUUID } from "node:crypto";

import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import type { PoolClient } from "pg";

import { PLAN_LIMITS, TRIAL_PERIOD_DAYS, type PlanTier } from "../plan-catalog.js";
import { DbService } from "../db/db.service.js";
import type { CreateTenantDto } from "./dto/create-tenant.dto.js";
import type { UpdateTenantDto } from "./dto/update-tenant.dto.js";
import {
  currentAcademicYearBounds,
  DEFAULT_FEE_CATEGORIES,
  DEFAULT_LEAVE_TYPES,
  DEFAULT_MASTER_DATA_ITEMS,
  DEFAULT_RETENTION_POLICIES,
  DEFAULT_STAFF_CATEGORIES,
  SYSTEM_ROLE_NAMES,
  SYSTEM_ROLE_PERMISSIONS,
} from "./provisioning-defaults.js";

export interface TenantRow {
  id: string;
  name: string;
  subdomain: string | null;
  subscription_status: string;
  plan_tier: PlanTier;
  trial_ends_at: Date | null;
  subscription_expires_at: Date | null;
  is_suspended: boolean;
}

interface UsageCounts {
  branches: number;
  super_admins: number;
  branch_admins: number;
  students: number;
  staff: number;
}

function generatePassword(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

@Injectable()
export class TenantsService {
  constructor(private readonly db: DbService) {}

  // One row per tenant, with live usage counts merged in -- the vendor's
  // at-a-glance "N/limit" view. Every tenant-scoped table (branches,
  // users, roles, students, staff, ...) has FORCE ROW LEVEL SECURITY
  // applied, which restricts even this app's schema-owning connection --
  // there's no single query that can read "all tenants' branches" at
  // once, so this loops per tenant, scoping each one's counts inside its
  // own `withTenant` transaction (same as cloud-api's DbService does per
  // request). Fine at vendor-console scale (tens to low hundreds of
  // tenants, not a hot path).
  async listTenants() {
    const tenants = await this.db.query<TenantRow>(
      "SELECT id, name, subdomain, subscription_status, plan_tier, trial_ends_at, subscription_expires_at, is_suspended FROM tenants ORDER BY name ASC",
    );

    return Promise.all(
      tenants.map(async (t) => {
        const usage = await this.getUsageCounts(t.id);
        const limits = PLAN_LIMITS[t.plan_tier];
        return {
          ...t,
          usage: {
            branches: { count: usage.branches, limit: limits.max_branches },
            super_admins: { count: usage.super_admins, limit: limits.max_super_admins },
            branch_admins: { count: usage.branch_admins, limit: limits.max_branch_admins },
            students: { count: usage.students, limit: limits.max_students },
            staff: { count: usage.staff, limit: limits.max_staff },
          },
        };
      }),
    );
  }

  private async getUsageCounts(tenantId: string): Promise<UsageCounts> {
    return this.db.withTenant(tenantId, async (client) => {
      // Sequential, not Promise.all -- these all run on the one PoolClient
      // withTenant hands back, and a single pg connection can't service
      // concurrent queries (unlike cloud-api's identical-shaped
      // PlanLimitsService.getPlanUsage, which calls this.db.query(tenantId,
      // ...) per query, each opening its own separate connection). Firing
      // them concurrently here only ever appeared to work via a deprecated
      // internal pg queue slated for removal in pg@9.
      const branches = await client.query<{ count: string }>(
        "SELECT count(*) FROM branches WHERE tenant_id = $1 AND deleted_at IS NULL",
        [tenantId],
      );
      const superAdmins = await client.query<{ count: string }>(
        `SELECT count(DISTINCT ur.user_id) FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
         JOIN users u ON u.id = ur.user_id AND u.tenant_id = ur.tenant_id
         WHERE ur.tenant_id = $1 AND r.name = 'super_admin' AND u.deleted_at IS NULL AND u.is_active = true`,
        [tenantId],
      );
      const branchAdmins = await client.query<{ count: string }>(
        `SELECT count(DISTINCT ur.user_id) FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
         JOIN users u ON u.id = ur.user_id AND u.tenant_id = ur.tenant_id
         WHERE ur.tenant_id = $1 AND r.name = 'branch_admin' AND u.deleted_at IS NULL AND u.is_active = true`,
        [tenantId],
      );
      const students = await client.query<{ count: string }>(
        "SELECT count(*) FROM students WHERE tenant_id = $1 AND status = 'enrolled' AND deleted_at IS NULL",
        [tenantId],
      );
      const staff = await client.query<{ count: string }>(
        "SELECT count(*) FROM staff WHERE tenant_id = $1 AND status != 'relieved' AND deleted_at IS NULL",
        [tenantId],
      );
      return {
        branches: Number(branches.rows[0]?.count ?? 0),
        super_admins: Number(superAdmins.rows[0]?.count ?? 0),
        branch_admins: Number(branchAdmins.rows[0]?.count ?? 0),
        students: Number(students.rows[0]?.count ?? 0),
        staff: Number(staff.rows[0]?.count ?? 0),
      };
    });
  }

  async getTenant(id: string) {
    const tenant = await this.db.queryOne<TenantRow>(
      "SELECT id, name, subdomain, subscription_status, plan_tier, trial_ends_at, subscription_expires_at, is_suspended FROM tenants WHERE id = $1",
      [id],
    );
    if (!tenant) {
      throw new NotFoundException("tenant not found");
    }
    return tenant;
  }

  async updateTenant(id: string, dto: UpdateTenantDto) {
    const existing = await this.getTenant(id);

    const plan_tier = dto.plan_tier ?? existing.plan_tier;
    const trial_ends_at = dto.trial_ends_at !== undefined ? dto.trial_ends_at : existing.trial_ends_at;
    const subscription_expires_at =
      dto.subscription_expires_at !== undefined ? dto.subscription_expires_at : existing.subscription_expires_at;
    const is_suspended = dto.is_suspended ?? existing.is_suspended;

    // subscription_status is a display-only cache for this list view --
    // never the enforcement source of truth (see PlanLimitsService in
    // cloud-api, which reads plan_tier/trial_ends_at/subscription_expires_
    // at/is_suspended directly). Recomputed here purely for convenience.
    const subscription_status = is_suspended
      ? "suspended"
      : plan_tier === "trial"
        ? "trial"
        : "active";

    const updated = await this.db.queryOne<TenantRow>(
      `UPDATE tenants SET plan_tier = $1, trial_ends_at = $2, subscription_expires_at = $3, is_suspended = $4, subscription_status = $5, updated_at = now()
       WHERE id = $6
       RETURNING id, name, subdomain, subscription_status, plan_tier, trial_ends_at, subscription_expires_at, is_suspended`,
      [plan_tier, trial_ends_at, subscription_expires_at, is_suspended, subscription_status, id],
    );
    if (!updated) {
      throw new NotFoundException("tenant not found");
    }
    return updated;
  }

  // Full tenant provisioning, reusing scripts/create-tenant.ts's exact
  // transaction shape (tenant + first branch + session + 5 fixed roles +
  // role_permissions + default master data + first super_admin user),
  // parameterized by plan tier. Supersedes running that script by hand
  // for day-to-day onboarding.
  async createTenant(dto: CreateTenantDto) {
    const existing = await this.db.queryOne<{ id: string }>("SELECT id FROM tenants WHERE subdomain = $1", [
      dto.subdomain,
    ]);
    if (existing) {
      throw new ConflictException(`Subdomain "${dto.subdomain}" is already taken.`);
    }

    const now = new Date();
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const adminPassword = dto.admin_password ?? generatePassword();
    const planTier = dto.plan_tier ?? "trial";
    const trialEndsAt = planTier === "trial" ? new Date(now.getTime() + TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000) : null;

    await this.db.withTenant(tenantId, async (client: PoolClient) => {
      await client.query(
        `INSERT INTO tenants (id, name, subdomain, subscription_status, plan_tier, trial_ends_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, dto.school_name, dto.subdomain, planTier === "trial" ? "trial" : "active", planTier, trialEndsAt, now],
      );

      await client.query(
        `INSERT INTO branches (id, tenant_id, name, code, updated_at) VALUES ($1, $2, $3, $4, $5)`,
        [branchId, tenantId, dto.branch_name, dto.branch_code, now],
      );

      const session = currentAcademicYearBounds(now);
      await client.query(
        `INSERT INTO academic_sessions (id, tenant_id, name, start_date, end_date, is_current, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, $6)`,
        [randomUUID(), tenantId, session.name, session.startDate, session.endDate, now],
      );

      const roleIds = new Map<string, string>();
      for (const roleName of SYSTEM_ROLE_NAMES) {
        const roleId = randomUUID();
        roleIds.set(roleName, roleId);
        await client.query(`INSERT INTO roles (id, tenant_id, name, is_system, updated_at) VALUES ($1, $2, $3, true, $4)`, [
          roleId,
          tenantId,
          roleName,
          now,
        ]);
        for (const permissionKey of SYSTEM_ROLE_PERMISSIONS[roleName]) {
          await client.query(
            `INSERT INTO role_permissions (id, tenant_id, role_id, permission_key, updated_at) VALUES ($1, $2, $3, $4, $5)`,
            [randomUUID(), tenantId, roleId, permissionKey, now],
          );
        }
      }

      for (const name of DEFAULT_STAFF_CATEGORIES) {
        await client.query(
          `INSERT INTO staff_categories (id, tenant_id, name, is_system, updated_at) VALUES ($1, $2, $3, true, $4)`,
          [randomUUID(), tenantId, name, now],
        );
      }

      for (const { name, quotaEnabled } of DEFAULT_LEAVE_TYPES) {
        await client.query(
          `INSERT INTO leave_types (id, tenant_id, name, is_system, quota_enabled, updated_at) VALUES ($1, $2, $3, true, $4, $5)`,
          [randomUUID(), tenantId, name, quotaEnabled, now],
        );
      }

      for (const { key, name } of DEFAULT_FEE_CATEGORIES) {
        await client.query(
          `INSERT INTO fee_categories (id, tenant_id, key, name, is_system, updated_at) VALUES ($1, $2, $3, $4, true, $5)`,
          [randomUUID(), tenantId, key, name, now],
        );
      }

      for (const { type, name } of DEFAULT_MASTER_DATA_ITEMS) {
        await client.query(
          `INSERT INTO master_data_items (id, tenant_id, type, name, is_system, updated_at) VALUES ($1, $2, $3, $4, true, $5)`,
          [randomUUID(), tenantId, type, name, now],
        );
      }

      for (const policy of DEFAULT_RETENTION_POLICIES) {
        await client.query(
          `INSERT INTO retention_policies (id, tenant_id, category, retention_years, is_active, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          [randomUUID(), tenantId, policy.category, policy.retention_years, policy.is_active, now],
        );
      }

      const passwordHash = await bcrypt.hash(adminPassword, 10);
      const userId = randomUUID();
      await client.query(
        `INSERT INTO users (id, tenant_id, full_name, email, password_hash, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, tenantId, dto.admin_name, dto.admin_email, passwordHash, now],
      );

      const superAdminRoleId = roleIds.get("super_admin");
      if (!superAdminRoleId) throw new BadRequestException("super_admin role was not created");
      await client.query(
        `INSERT INTO user_roles (id, tenant_id, user_id, role_id, updated_at) VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), tenantId, userId, superAdminRoleId, now],
      );
    });

    return {
      tenant_id: tenantId,
      subdomain: dto.subdomain,
      plan_tier: planTier,
      trial_ends_at: trialEndsAt,
      admin_email: dto.admin_email,
      admin_password: adminPassword,
    };
  }
}
