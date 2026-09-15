import { Injectable } from "@nestjs/common";

import { TOGGLEABLE_MODULES } from "../common/permission-catalog.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class ModuleSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // A module with no row yet defaults to enabled -- so existing branches
  // don't need a migration-time backfill for every module key. Rows are
  // set by the vendor directly against the database -- there is no
  // in-app write path (see docs/architecture.md).
  async getModuleSettings(branchId: string) {
    const rows = await this.prisma.moduleSetting.findMany({
      where: { branchId, deletedAt: null },
    });
    const existing = new Map(rows.map((r) => [r.moduleKey, r.isEnabled]));

    return TOGGLEABLE_MODULES.map((key) => ({
      module_key: key,
      is_enabled: existing.get(key) ?? true,
    }));
  }
}
