import { randomUUID } from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { ScopedAccessService } from "../common/scoped-access.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateMasterDataItemDto } from "./dto/create-master-data-item.dto.js";
import type { UpdateMasterDataItemDto } from "./dto/update-master-data-item.dto.js";
import { isMasterDataType, MANAGE_PERMISSION_BY_TYPE } from "./master-data-types.js";

@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopedAccess: ScopedAccessService,
  ) {}

  // Read side is intentionally permission-free (beyond being logged in) --
  // any user filling a student/staff/guardian form needs to read these
  // lists to populate a dropdown, the same way listClasses/listSections
  // already work.
  listItems(tenantId: string, type: string) {
    return this.prisma.masterDataItem.findMany({
      where: { tenantId, type, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  // Write permission depends on which `type` the request targets, so it
  // can't be a static @RequirePermission on the controller handler -- it's
  // checked here instead, once the type is known.
  private async assertCanManage(actorUserId: string, type: string) {
    if (!isMasterDataType(type)) {
      throw new BadRequestException(`unknown master data type '${type}'`);
    }
    const permission = MANAGE_PERMISSION_BY_TYPE[type];
    if (!(await this.scopedAccess.hasPermission(actorUserId, permission))) {
      throw new ForbiddenException(`missing permission: ${permission}`);
    }
  }

  async createItem(tenantId: string, actorUserId: string, dto: CreateMasterDataItemDto) {
    await this.assertCanManage(actorUserId, dto.type);

    const now = new Date();
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.masterDataItem.create({
        data: { id, tenantId, type: dto.type, name: dto.name, isSystem: false, updatedAt: now, updatedBy: actorUserId },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "master_data_items",
        entityId: id,
        action: "create",
        summary: `Created ${dto.type} master data '${dto.name}'`,
      });

      return created;
    });
  }

  async updateItem(tenantId: string, actorUserId: string, id: string, dto: UpdateMasterDataItemDto) {
    const existing = await this.prisma.masterDataItem.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("master data item not found");
    }
    await this.assertCanManage(actorUserId, existing.type);

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.masterDataItem.update({
        where: { id },
        data: { name: dto.name, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "master_data_items",
        entityId: id,
        action: "update",
        summary: `Renamed ${existing.type} master data to '${dto.name}'`,
      });

      return updated;
    });
  }

  // Blocked for a seeded default value -- deleting it out from under
  // existing student/staff/guardian records that already reference it by
  // name (not by this table's id) would just make the value disappear from
  // the dropdown, not orphan anything, but system defaults stay protected
  // for consistency with every other lookup table in this codebase.
  async deleteItem(tenantId: string, actorUserId: string, id: string) {
    const existing = await this.prisma.masterDataItem.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("master data item not found");
    }
    await this.assertCanManage(actorUserId, existing.type);
    if (existing.isSystem) {
      throw new BadRequestException("cannot delete a default value");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.masterDataItem.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "master_data_items",
        entityId: id,
        action: "delete",
        summary: `Deleted ${existing.type} master data '${existing.name}'`,
      });

      return deleted;
    });
  }
}
