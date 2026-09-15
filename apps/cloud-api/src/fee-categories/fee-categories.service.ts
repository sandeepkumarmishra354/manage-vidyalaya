import { randomUUID } from "node:crypto";

import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateFeeCategoryDto } from "./dto/create-fee-category.dto.js";
import type { UpdateFeeCategoryDto } from "./dto/update-fee-category.dto.js";

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
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listCategories(tenantId: string) {
    return this.prisma.feeCategory.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async createCategory(tenantId: string, actorUserId: string, dto: CreateFeeCategoryDto) {
    const key = slugify(dto.name);
    if (!key) {
      throw new BadRequestException("invalid category name");
    }

    const existing = await this.prisma.feeCategory.findFirst({ where: { tenantId, key, deletedAt: null } });
    if (existing) {
      throw new ConflictException("a fee category with this name already exists");
    }

    const now = new Date();
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.feeCategory.create({
        data: { id, tenantId, name: dto.name, key, isSystem: false, updatedAt: now, updatedBy: actorUserId },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "fee_categories",
        entityId: id,
        action: "create",
        summary: `Created fee category '${dto.name}'`,
      });

      return created;
    });
  }

  // Renames the display name only -- key stays stable since it's already
  // referenced by FeeStructure.feeType rows.
  async updateCategory(tenantId: string, actorUserId: string, id: string, dto: UpdateFeeCategoryDto) {
    const existing = await this.prisma.feeCategory.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("fee category not found");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.feeCategory.update({
        where: { id },
        data: { name: dto.name, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
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
    const existing = await this.prisma.feeCategory.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("fee category not found");
    }
    if (existing.isSystem) {
      throw new BadRequestException("cannot delete a default fee category");
    }

    const referencedCount = await this.prisma.feeStructure.count({
      where: { tenantId, feeType: existing.key, deletedAt: null },
    });
    if (referencedCount > 0) {
      throw new BadRequestException("cannot delete a category that is still used by a fee structure");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.feeCategory.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
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
