import { Injectable } from "@nestjs/common";

import { PlanLimitsService } from "../common/plan-limits.service.js";
import { TOGGLEABLE_MODULES } from "../common/permission-catalog.js";
import { PLAN_LIMITS } from "../common/plan-catalog.js";
import { DbService } from "../db/db.service.js";

@Injectable()
export class ModuleSettingsService {
  constructor(
    private readonly db: DbService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  // A module with no row yet defaults to enabled -- so existing branches
  // don't need a migration-time backfill for every module key. Rows are
  // set by the vendor directly against the database -- there is no
  // in-app write path (see docs/architecture.md). Plan tier is layered on
  // top as a ceiling: a module the tenant's plan doesn't include is never
  // enabled regardless of what module_settings says, since a downgrade
  // should hide it immediately without needing to touch every branch's
  // rows.
  async getModuleSettings(tenantId: string, branchId: string) {
    const tier = await this.planLimits.getPlanTier(tenantId);
    const eligible = new Set(PLAN_LIMITS[tier].modules);

    const rows = await this.db.query<{ module_key: string; is_enabled: boolean }>(
      tenantId,
      "SELECT module_key, is_enabled FROM module_settings WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL",
      [tenantId, branchId],
    );
    const existing = new Map(rows.map((r) => [r.module_key, r.is_enabled]));

    return TOGGLEABLE_MODULES.map((key) => ({
      module_key: key,
      is_enabled: eligible.has(key) && (existing.get(key) ?? true),
    }));
  }
}
