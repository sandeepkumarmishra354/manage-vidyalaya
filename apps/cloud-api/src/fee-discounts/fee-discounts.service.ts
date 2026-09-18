import { randomUUID } from "node:crypto";

import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { FeesService } from "../fees/fees.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StudentsService } from "../students/students.service.js";
import type { AssignDiscountDto } from "./dto/assign-discount.dto.js";
import type { CreateFeeDiscountDto } from "./dto/create-fee-discount.dto.js";
import type { UpdateFeeDiscountDto } from "./dto/update-fee-discount.dto.js";

// A stable slug (matches FeeCategory's convention) derived from the display
// name -- e.g. "Sibling Discount" -> "sibling_discount".
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

@Injectable()
export class FeeDiscountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly feesService: FeesService,
    private readonly studentsService: StudentsService,
  ) {}

  listDiscounts(tenantId: string) {
    return this.prisma.feeDiscount.findMany({ where: { tenantId, deletedAt: null }, orderBy: { name: "asc" } });
  }

  async createDiscount(tenantId: string, actorUserId: string, dto: CreateFeeDiscountDto) {
    const key = slugify(dto.name);
    if (!key) {
      throw new BadRequestException("invalid discount name");
    }

    const existing = await this.prisma.feeDiscount.findFirst({ where: { tenantId, key, deletedAt: null } });
    if (existing) {
      throw new ConflictException("a fee discount with this name already exists");
    }

    const now = new Date();
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.feeDiscount.create({
        data: {
          id,
          tenantId,
          name: dto.name,
          key,
          discountType: dto.discount_type,
          value: dto.value,
          feeCategoryId: dto.fee_category_id ?? null,
          isActive: true,
          validFrom: dto.valid_from ? new Date(dto.valid_from) : null,
          validTo: dto.valid_to ? new Date(dto.valid_to) : null,
          updatedAt: now,
          updatedBy: actorUserId,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "fee_discounts",
        entityId: id,
        action: "create",
        summary: `Created fee discount '${dto.name}'`,
      });

      return created;
    });
  }

  async updateDiscount(tenantId: string, actorUserId: string, id: string, dto: UpdateFeeDiscountDto) {
    const existing = await this.prisma.feeDiscount.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("fee discount not found");
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.feeDiscount.update({
        where: { id },
        data: {
          name: dto.name,
          discountType: dto.discount_type,
          value: dto.value,
          feeCategoryId: dto.fee_category_id ?? null,
          isActive: dto.is_active ?? existing.isActive,
          validFrom: dto.valid_from !== undefined ? (dto.valid_from ? new Date(dto.valid_from) : null) : existing.validFrom,
          validTo: dto.valid_to !== undefined ? (dto.valid_to ? new Date(dto.valid_to) : null) : existing.validTo,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "fee_discounts",
        entityId: id,
        action: "update",
        summary: `Updated fee discount '${dto.name}'`,
      });

      return updated;
    });
  }

  // Blocked while any active (non-deleted) student assignment exists --
  // deleting it out from under assigned students would silently strip
  // their discount from future invoices.
  async deleteDiscount(tenantId: string, actorUserId: string, id: string) {
    const existing = await this.prisma.feeDiscount.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("fee discount not found");
    }

    const assignedCount = await this.prisma.studentFeeDiscount.count({
      where: { feeDiscountId: id, deletedAt: null },
    });
    if (assignedCount > 0) {
      throw new BadRequestException("cannot delete a discount that is still assigned to students");
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.feeDiscount.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "fee_discounts",
        entityId: id,
        action: "delete",
        summary: `Deleted fee discount '${existing.name}'`,
      });

      return deleted;
    });
  }

  async assignDiscountToStudents(tenantId: string, actorUserId: string, feeDiscountId: string, dto: AssignDiscountDto) {
    const discount = await this.prisma.feeDiscount.findFirst({ where: { id: feeDiscountId, tenantId, deletedAt: null } });
    if (!discount) {
      throw new NotFoundException("fee discount not found");
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const assignedStudentIds: string[] = [];
      for (const studentId of dto.student_ids) {
        const existing = await tx.studentFeeDiscount.findFirst({ where: { studentId, feeDiscountId } });
        if (existing) {
          await tx.studentFeeDiscount.update({
            where: { id: existing.id },
            data: {
              reason: dto.reason ?? null,
              deletedAt: null,
              updatedAt: now,
              updatedBy: actorUserId,
              version: { increment: 1 },
            },
          });
        } else {
          await tx.studentFeeDiscount.create({
            data: {
              id: randomUUID(),
              tenantId,
              studentId,
              feeDiscountId,
              reason: dto.reason ?? null,
              updatedAt: now,
              updatedBy: actorUserId,
            },
          });
        }
        assignedStudentIds.push(studentId);
      }

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "student_fee_discounts",
        entityId: feeDiscountId,
        action: "create",
        summary: `Assigned discount '${discount.name}' to ${assignedStudentIds.length} student(s)`,
      });

      if (dto.apply_to_existing_invoices) {
        for (const studentId of assignedStudentIds) {
          await this.feesService.reapplyDiscountsForStudent(tenantId, actorUserId, studentId, tx);
        }
      }

      return { assigned: assignedStudentIds.length };
    });
  }

  async removeDiscountAssignment(tenantId: string, actorUserId: string, assignmentId: string) {
    const existing = await this.prisma.studentFeeDiscount.findFirst({
      where: { id: assignmentId, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException("assignment not found");
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.studentFeeDiscount.update({
        where: { id: assignmentId },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "student_fee_discounts",
        entityId: assignmentId,
        action: "delete",
        summary: "Removed fee discount assignment",
      });

      return updated;
    });
  }

  async listStudentDiscounts(studentId: string) {
    const rows = await this.prisma.studentFeeDiscount.findMany({
      where: { studentId, deletedAt: null },
      include: { feeDiscount: true },
    });
    return rows.map((r) => ({
      id: r.id,
      fee_discount_id: r.feeDiscountId,
      fee_discount_name: r.feeDiscount.name,
      discount_type: r.feeDiscount.discountType,
      value: r.feeDiscount.value,
      reason: r.reason,
    }));
  }

  async listDiscountAssignees(feeDiscountId: string) {
    const rows = await this.prisma.studentFeeDiscount.findMany({
      where: { feeDiscountId, deletedAt: null },
      include: { student: { include: { currentClass: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      student_id: r.studentId,
      student_name: [r.student.firstName, r.student.lastName].filter(Boolean).join(" "),
      class_name: r.student.currentClass?.name ?? null,
      reason: r.reason,
    }));
  }

  // Thin pass-through to the existing sibling lookup -- powers a "Suggest
  // siblings" helper when assigning a discount like "sibling discount".
  suggestSiblingsForDiscount(tenantId: string, studentId: string) {
    return this.studentsService.getSiblings(tenantId, studentId);
  }
}
