import { Injectable } from "@nestjs/common";

import { TOGGLEABLE_MODULES } from "../common/permission-catalog.js";
import { DbService } from "../db/db.service.js";

@Injectable()
export class ModuleSettingsService {
  constructor(private readonly db: DbService) {}

  // A module with no row yet defaults to enabled -- so existing branches
  // don't need a migration-time backfill for every module key. Rows are
  // set by the vendor directly against the database -- there is no
  // in-app write path (see docs/architecture.md).
  async getModuleSettings(tenantId: string, branchId: string) {
    const rows = await this.db.query<{ module_key: string; is_enabled: boolean }>(
      tenantId,
      "SELECT module_key, is_enabled FROM module_settings WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL",
      [tenantId, branchId],
    );
    const existing = new Map(rows.map((r) => [r.module_key, r.is_enabled]));

    return TOGGLEABLE_MODULES.map((key) => ({
      module_key: key,
      is_enabled: existing.get(key) ?? true,
    }));
  }
}
