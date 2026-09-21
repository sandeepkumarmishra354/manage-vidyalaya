import { ForbiddenException, Injectable } from "@nestjs/common";

import { DbService } from "../db/db.service.js";
import { PLAN_LIMITS, type PlanLimits, type PlanTier } from "./plan-catalog.js";

interface TenantPlanRow {
  plan_tier: PlanTier;
  trial_ends_at: Date | null;
  subscription_expires_at: Date | null;
  is_suspended: boolean;
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
