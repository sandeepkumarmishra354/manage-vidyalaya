import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";

import { DbService } from "../db/db.service.js";
import type { ToggleableModule } from "./permission-catalog.js";
import { PLAN_LIMITS, type PlanLimits, type PlanTier } from "./plan-catalog.js";

interface TenantPlanRow {
  plan_tier: PlanTier;
  trial_ends_at: Date | null;
  subscription_expires_at: Date | null;
  is_suspended: boolean;
}

interface UsageMetric {
  count: number;
  limit: number;
}

export interface PlanUsage {
  plan_tier: PlanTier;
  trial_ends_at: Date | null;
  subscription_expires_at: Date | null;
  usage: {
    branches: UsageMetric;
    super_admins: UsageMetric;
    branch_admins: UsageMetric;
    students: UsageMetric;
    staff: UsageMetric;
  };
}

// Small, injectable helper (mirrors AuditService's shape -- injected into
// every service that needs to check a plan-tier limit) wrapping
// tenants.plan_tier/trial_ends_at/subscription_expires_at/is_suspended,
// the source of truth set up in the tenant-plan-tier migration.
@Injectable()
export class PlanLimitsService {
  constructor(private readonly db: DbService) {}

  // A trial tenant is treated as Gold-tier (see plan-catalog.ts's
  // PLAN_LIMITS.trial) only until trial_ends_at -- past that it has no
  // valid tier at all, since it was never assigned a real plan. Callers
  // that need to know "is this tenant currently allowed in" (login) check
  // trial_ends_at/subscription_expires_at/is_suspended directly instead of
  // going through this method, since "expired trial" isn't itself a tier.
  async getPlanTier(tenantId: string): Promise<PlanTier> {
    const row = await this.getTenantPlanRow(tenantId);
    return row.plan_tier;
  }

  async getPlanLimits(tenantId: string): Promise<PlanLimits> {
    return PLAN_LIMITS[await this.getPlanTier(tenantId)];
  }

  // Hard-blocks login/refresh for a suspended tenant or one past its
  // trial/subscription expiry -- called by AuthService alongside the
  // existing assertLinkedStaffAllowsAccess check. A tenant grandfathered
  // by the plan-tier migration (trial_ends_at and subscription_expires_at
  // both NULL) is never blocked here, by design: NULL means open-ended.
  async assertTenantActive(tenantId: string): Promise<void> {
    const row = await this.getTenantPlanRow(tenantId);
    if (row.is_suspended) {
      throw new UnauthorizedException("Your school's account has been suspended. Contact your administrator.");
    }
    const now = new Date();
    if (row.plan_tier === "trial" && row.trial_ends_at && row.trial_ends_at < now) {
      throw new UnauthorizedException("Your school's trial period has ended. Contact your administrator to choose a plan.");
    }
    if (row.plan_tier !== "trial" && row.subscription_expires_at && row.subscription_expires_at < now) {
      throw new UnauthorizedException("Your school's subscription has expired. Contact your administrator to renew.");
    }
  }

  // Read-only self-service view for the "Plan & Usage" panel in School
  // Details -- same count-query shapes as the enforcement checks above
  // and as vendor-admin-api's TenantsService.getUsageCounts, just scoped
  // to the caller's own tenant instead of looped across all tenants.
  async getPlanUsage(tenantId: string): Promise<PlanUsage> {
    const row = await this.getTenantPlanRow(tenantId);
    const limits = PLAN_LIMITS[row.plan_tier];

    const [branches, superAdmins, branchAdmins, students, staff] = await Promise.all([
      this.db.query<{ count: string }>(
        tenantId,
        "SELECT count(*) FROM branches WHERE tenant_id = $1 AND deleted_at IS NULL",
        [tenantId],
      ),
      this.db.query<{ count: string }>(
        tenantId,
        `SELECT count(DISTINCT ur.user_id) FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
         JOIN users u ON u.id = ur.user_id AND u.tenant_id = ur.tenant_id
         WHERE ur.tenant_id = $1 AND r.name = 'super_admin' AND u.deleted_at IS NULL AND u.is_active = true`,
        [tenantId],
      ),
      this.db.query<{ count: string }>(
        tenantId,
        `SELECT count(DISTINCT ur.user_id) FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
         JOIN users u ON u.id = ur.user_id AND u.tenant_id = ur.tenant_id
         WHERE ur.tenant_id = $1 AND r.name = 'branch_admin' AND u.deleted_at IS NULL AND u.is_active = true`,
        [tenantId],
      ),
      this.db.query<{ count: string }>(
        tenantId,
        "SELECT count(*) FROM students WHERE tenant_id = $1 AND status = 'enrolled' AND deleted_at IS NULL",
        [tenantId],
      ),
      this.db.query<{ count: string }>(
        tenantId,
        "SELECT count(*) FROM staff WHERE tenant_id = $1 AND status != 'relieved' AND deleted_at IS NULL",
        [tenantId],
      ),
    ]);

    return {
      plan_tier: row.plan_tier,
      trial_ends_at: row.trial_ends_at,
      subscription_expires_at: row.subscription_expires_at,
      usage: {
        branches: { count: Number(branches[0]?.count ?? 0), limit: limits.max_branches },
        super_admins: { count: Number(superAdmins[0]?.count ?? 0), limit: limits.max_super_admins },
        branch_admins: { count: Number(branchAdmins[0]?.count ?? 0), limit: limits.max_branch_admins },
        students: { count: Number(students[0]?.count ?? 0), limit: limits.max_students },
        staff: { count: Number(staff[0]?.count ?? 0), limit: limits.max_staff },
      },
    };
  }

  // Which toggleable modules the tenant's plan tier makes available at all
  // -- the ceiling ModuleSettingsService.getModuleSettings intersects with
  // the tenant's own per-branch module_settings toggle. Factored out here
  // (rather than duplicated) so isModuleEnabled below and
  // ModuleAccessGuard can share it without a circular dependency on
  // ModuleSettingsService.
  async getEligibleModules(tenantId: string): Promise<Set<ToggleableModule>> {
    const tier = await this.getPlanTier(tenantId);
    return new Set(PLAN_LIMITS[tier].modules);
  }

  // Backend enforcement gate for ModuleAccessGuard -- mirrors
  // getModuleSettings's own eligible-tier-AND-branch-toggle logic exactly,
  // so a module hidden from the nav is also actually blocked at the API.
  // `branchId: null` means "tenant-wide caller, no branch context" -- in
  // that case only the tier ceiling is checked (a Silver tenant's
  // `modules: []` already blocks everything regardless of branch), since
  // there's no single branch's module_settings row to consult.
  async isModuleEnabled(tenantId: string, branchId: string | null, moduleKey: ToggleableModule): Promise<boolean> {
    const eligible = await this.getEligibleModules(tenantId);
    if (!eligible.has(moduleKey)) {
      return false;
    }
    if (!branchId) {
      return true;
    }
    const row = await this.db.queryOne<{ is_enabled: boolean }>(
      tenantId,
      "SELECT is_enabled FROM module_settings WHERE tenant_id = $1 AND branch_id = $2 AND module_key = $3 AND deleted_at IS NULL",
      [tenantId, branchId, moduleKey],
    );
    return row?.is_enabled ?? true;
  }

  async getTenantPlanRow(tenantId: string): Promise<TenantPlanRow> {
    const rows = await this.db.query<TenantPlanRow>(
      tenantId,
      "SELECT plan_tier, trial_ends_at, subscription_expires_at, is_suspended FROM tenants WHERE id = $1",
      [tenantId],
    );
    const row = rows[0];
    if (!row) {
      throw new ForbiddenException("Tenant not found");
    }
    return row;
  }

  // Throws when adding one more of `currentCount + 1` would exceed the
  // tenant's plan limit for `limitKey`. Callers count the resource
  // themselves (the right query shape differs per resource -- active
  // students vs. relieved staff vs. branches) and pass the count in.
  async assertUnderLimit(tenantId: string, limitKey: keyof PlanLimits, currentCount: number, message: string): Promise<void> {
    const limits = await this.getPlanLimits(tenantId);
    const max = limits[limitKey];
    if (typeof max === "number" && currentCount >= max) {
      throw new ForbiddenException(message);
    }
  }
}
