import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { findOneForTenant, insertRow, softDeleteRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { CreateFeeCategoryDto } from "./dto/create-fee-category.dto.js";
import type { UpdateFeeCategoryDto } from "./dto/update-fee-category.dto.js";

export interface FeeCategoryRow extends TenantRow {
  name: string;
  key: string;
  is_system: boolean;
}

// A stable slug (matches FeeStructure.feeType convention) derived from the
// display name -- e.g. "Sports Fee" -> "sports_fee".
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

@Injectable()
export class FeeCategoriesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  listCategories(tenantId: string) {
    return this.db.query<FeeCategoryRow>(
      tenantId,
      "SELECT * FROM fee_categories WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC",
      [tenantId],
    );
  }

  async createCategory(tenantId: string, actorUserId: string, dto: CreateFeeCategoryDto) {
    const key = slugify(dto.name);
    if (!key) {
      throw new BadRequestException("invalid category name");
    }

    return this.db.withTransaction(tenantId, async (client) => {
      const existingResult = await client.query<FeeCategoryRow>(
        "SELECT * FROM fee_categories WHERE tenant_id = $1 AND key = $2 AND deleted_at IS NULL",
        [tenantId, key],
      );
      if (existingResult.rows[0]) {
        throw new ConflictException("a fee category with this name already exists");
      }

      const created = await insertRow<FeeCategoryRow>(client, "fee_categories", tenantId, {
        name: dto.name,
        key,
        is_system: false,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "fee_categories",
        entityId: created.id,
        action: "create",
        summary: `Created fee category '${dto.name}'`,
      });

      return created;
    });
  }

  // Renames the display name only -- key stays stable since it's already
  // referenced by FeeStructure.feeType rows.
  async updateCategory(tenantId: string, actorUserId: string, id: string, dto: UpdateFeeCategoryDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<FeeCategoryRow>(client, "fee_categories", tenantId, id);
      if (!existing) {
        throw new NotFoundException("fee category not found");
      }

      const updated = await updateRow<FeeCategoryRow>(client, "fee_categories", tenantId, id, {
        name: dto.name,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "fee_categories",
        entityId: id,
        action: "update",
        summary: `Renamed fee category to '${dto.name}'`,
      });

      return updated;
    });
  }

  // Blocked for a seeded default category or one still referenced by a fee
  // structure -- deleting it out from under an in-use structure would
  // silently orphan its fee_type.
  async deleteCategory(tenantId: string, actorUserId: string, id: string) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<FeeCategoryRow>(client, "fee_categories", tenantId, id);
      if (!existing) {
        throw new NotFoundException("fee category not found");
      }
      if (existing.is_system) {
        throw new BadRequestException("cannot delete a default fee category");
      }

      const referencedResult = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM fee_structures WHERE tenant_id = $1 AND fee_type = $2 AND deleted_at IS NULL",
        [tenantId, existing.key],
      );
      const referencedCount = Number(referencedResult.rows[0]?.count ?? "0");
      if (referencedCount > 0) {
        throw new BadRequestException("cannot delete a category that is still used by a fee structure");
      }

      const deleted = await softDeleteRow<FeeCategoryRow>(client, "fee_categories", tenantId, id, actorUserId);

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "fee_categories",
        entityId: id,
        action: "delete",
        summary: `Deleted fee category '${existing.name}'`,
      });

      return deleted;
    });
  }
}
