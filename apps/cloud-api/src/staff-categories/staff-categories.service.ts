import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateStaffCategoryDto } from "./dto/create-staff-category.dto.js";
import type { UpdateStaffCategoryDto } from "./dto/update-staff-category.dto.js";

@Injectable()
export class StaffCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listCategories(tenantId: string) {
    return this.prisma.staffCategory.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async createCategory(tenantId: string, actorUserId: string, dto: CreateStaffCategoryDto) {
    const now = new Date();
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.staffCategory.create({
        data: { id, tenantId, name: dto.name, isSystem: false, updatedAt: now, updatedBy: actorUserId },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "staff_categories",
        entityId: id,
        action: "create",
        summary: `Created staff category '${dto.name}'`,
      });

      return created;
    });
  }

  async updateCategory(tenantId: string, actorUserId: string, id: string, dto: UpdateStaffCategoryDto) {
    const existing = await this.prisma.staffCategory.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("staff category not found");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.staffCategory.update({
        where: { id },
        data: { name: dto.name, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "staff_categories",
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
    const existing = await this.prisma.staffCategory.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("staff category not found");
    }
    if (existing.isSystem) {
      throw new BadRequestException("cannot delete a default staff category");
    }

    const referencedCount = await this.prisma.staff.count({ where: { categoryId: id, deletedAt: null } });
    if (referencedCount > 0) {
      throw new BadRequestException("cannot delete a category that is still assigned to staff");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.staffCategory.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "staff_categories",
        entityId: id,
        action: "delete",
        summary: `Deleted staff category '${existing.name}'`,
      });

      return deleted;
    });
  }
}
