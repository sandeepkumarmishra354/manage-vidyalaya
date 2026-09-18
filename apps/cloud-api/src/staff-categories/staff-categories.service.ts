import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { findOneForTenant, findManyForTenant, insertRow, softDeleteRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { CreateStaffCategoryDto } from "./dto/create-staff-category.dto.js";
import type { UpdateStaffCategoryDto } from "./dto/update-staff-category.dto.js";

const TABLE = "staff_categories";

export interface StaffCategoryRow extends TenantRow {
  name: string;
  is_system: boolean;
}

@Injectable()
export class StaffCategoriesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  listCategories(tenantId: string) {
    return this.db.withTransaction(tenantId, (client) =>
      findManyForTenant<StaffCategoryRow>(client, TABLE, tenantId, {}, "name ASC"),
    );
  }

  async createCategory(tenantId: string, actorUserId: string, dto: CreateStaffCategoryDto) {
    const now = new Date();

    return this.db.withTransaction(tenantId, async (client) => {
      const created = await insertRow<StaffCategoryRow>(client, TABLE, tenantId, {
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
        summary: `Created staff category '${dto.name}'`,
      });

      return created;
    });
  }

  async updateCategory(tenantId: string, actorUserId: string, id: string, dto: UpdateStaffCategoryDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<StaffCategoryRow>(client, TABLE, tenantId, id);
      if (!existing) {
        throw new NotFoundException("staff category not found");
      }

      const now = new Date();
      const updated = await updateRow<StaffCategoryRow>(client, TABLE, tenantId, id, {
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
        summary: `Renamed staff category to '${dto.name}'`,
      });

      return updated;
    });
  }

  // Blocked for a seeded default category or one still assigned to staff --
  // deleting it out from under an in-use assignment would silently orphan it.
  async deleteCategory(tenantId: string, actorUserId: string, id: string) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<StaffCategoryRow>(client, TABLE, tenantId, id);
      if (!existing) {
        throw new NotFoundException("staff category not found");
      }
      if (existing.is_system) {
        throw new BadRequestException("cannot delete a default staff category");
      }

      const referencedCount = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM staff WHERE tenant_id = $1 AND category_id = $2 AND deleted_at IS NULL",
        [tenantId, id],
      );
      if (Number(referencedCount.rows[0]?.count ?? "0") > 0) {
        throw new BadRequestException("cannot delete a category that is still assigned to staff");
      }

      const deleted = await softDeleteRow<StaffCategoryRow>(client, TABLE, tenantId, id, actorUserId);

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: TABLE,
        entityId: id,
        action: "delete",
        summary: `Deleted staff category '${existing.name}'`,
      });

      return deleted;
    });
  }
}
