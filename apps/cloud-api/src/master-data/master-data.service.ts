import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { ScopedAccessService } from "../common/scoped-access.service.js";
import { DbService } from "../db/db.service.js";
import { findOneForTenant, findManyForTenant, insertRow, softDeleteRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { CreateMasterDataItemDto } from "./dto/create-master-data-item.dto.js";
import type { UpdateMasterDataItemDto } from "./dto/update-master-data-item.dto.js";
import { isMasterDataType, MANAGE_PERMISSION_BY_TYPE } from "./master-data-types.js";

const TABLE = "master_data_items";

export interface MasterDataItemRow extends TenantRow {
  type: string;
  name: string;
  is_system: boolean;
  sort_order: number;
}

@Injectable()
export class MasterDataService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly scopedAccess: ScopedAccessService,
  ) {}

  // Read side is intentionally permission-free (beyond being logged in) --
  // any user filling a student/staff/guardian form needs to read these
  // lists to populate a dropdown, the same way listClasses/listSections
  // already work.
  listItems(tenantId: string, type: string) {
    return this.db.withTransaction(tenantId, (client) =>
      findManyForTenant<MasterDataItemRow>(client, TABLE, tenantId, { type }, "sort_order ASC, name ASC"),
    );
  }

  // Write permission depends on which `type` the request targets, so it
  // can't be a static @RequirePermission on the controller handler -- it's
  // checked here instead, once the type is known.
  private async assertCanManage(tenantId: string, actorUserId: string, type: string) {
    if (!isMasterDataType(type)) {
      throw new BadRequestException(`unknown master data type '${type}'`);
    }
    const permission = MANAGE_PERMISSION_BY_TYPE[type];
    if (!(await this.scopedAccess.hasPermission(tenantId, actorUserId, permission))) {
      throw new ForbiddenException(`missing permission: ${permission}`);
    }
  }

  async createItem(tenantId: string, actorUserId: string, dto: CreateMasterDataItemDto) {
    await this.assertCanManage(tenantId, actorUserId, dto.type);

    const now = new Date();

    return this.db.withTransaction(tenantId, async (client) => {
      const created = await insertRow<MasterDataItemRow>(client, TABLE, tenantId, {
        type: dto.type,
        name: dto.name,
        is_system: false,
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: TABLE,
        entityId: created.id,
        action: "create",
        summary: `Created ${dto.type} master data '${dto.name}'`,
      });

      return created;
    });
  }

  async updateItem(tenantId: string, actorUserId: string, id: string, dto: UpdateMasterDataItemDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<MasterDataItemRow>(client, TABLE, tenantId, id);
      if (!existing) {
        throw new NotFoundException("master data item not found");
      }
      await this.assertCanManage(tenantId, actorUserId, existing.type);

      const now = new Date();
      const updated = await updateRow<MasterDataItemRow>(client, TABLE, tenantId, id, {
        name: dto.name,
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: TABLE,
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
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<MasterDataItemRow>(client, TABLE, tenantId, id);
      if (!existing) {
        throw new NotFoundException("master data item not found");
      }
      await this.assertCanManage(tenantId, actorUserId, existing.type);
      if (existing.is_system) {
        throw new BadRequestException("cannot delete a default value");
      }

      const deleted = await softDeleteRow<MasterDataItemRow>(client, TABLE, tenantId, id, actorUserId);

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: TABLE,
        entityId: id,
        action: "delete",
        summary: `Deleted ${existing.type} master data '${existing.name}'`,
      });

      return deleted;
    });
  }
}
