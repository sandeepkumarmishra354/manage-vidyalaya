import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { TOGGLEABLE_MODULES } from "../common/permission-catalog.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { SetModuleEnabledDto } from "./dto/set-module-enabled.dto.js";

@Injectable()
export class ModuleSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // A module with no row yet defaults to enabled -- so existing branches
  // don't need a migration-time backfill for every module key.
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

  async setModuleEnabled(tenantId: string, actorUserId: string, dto: SetModuleEnabledDto) {
    if (!(TOGGLEABLE_MODULES as readonly string[]).includes(dto.module_key)) {
      throw new BadRequestException(`'${dto.module_key}' is not a toggleable module`);
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const setting = await tx.moduleSetting.upsert({
        where: { branchId_moduleKey: { branchId: dto.branch_id, moduleKey: dto.module_key } },
        create: {
          id: randomUUID(),
          tenantId,
          branchId: dto.branch_id,
          moduleKey: dto.module_key,
          isEnabled: dto.is_enabled,
          updatedAt: now,
          updatedBy: actorUserId,
        },
        update: { isEnabled: dto.is_enabled, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "module_settings",
        entityId: setting.id,
        action: "update",
        summary: `Set module '${dto.module_key}' to ${dto.is_enabled ? "enabled" : "disabled"}`,
      });

      return { module_key: dto.module_key, is_enabled: dto.is_enabled };
    });
  }
}
