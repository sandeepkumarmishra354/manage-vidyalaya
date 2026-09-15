import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreatePromotionBatchDto } from "./dto/create-promotion-batch.dto.js";
import type { SetPromotionDecisionDto } from "./dto/set-promotion-decision.dto.js";

@Injectable()
export class PromotionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Suggests a target class for each source class by matching
  // sort_order + 1 ("the next class up") rather than by name. Classes with
  // no match (typically the highest class, whose students graduate) come
  // back with suggested_to_class_id: null for the admin to resolve manually.
  async suggestClassMapping(branchId: string, fromSessionId: string, toSessionId: string) {
    const [fromClasses, toClasses] = await Promise.all([
      this.prisma.class.findMany({
        where: { branchId, academicSessionId: fromSessionId, deletedAt: null },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.class.findMany({
        where: { branchId, academicSessionId: toSessionId, deletedAt: null },
      }),
    ]);

    return fromClasses.map((c) => ({
      from_class_id: c.id,
      from_class_name: c.name,
      suggested_to_class_id: toClasses.find((tc) => tc.sortOrder === c.sortOrder + 1)?.id ?? null,
    }));
  }

  async createPromotionBatch(tenantId: string, actorUserId: string, dto: CreatePromotionBatchDto) {
    const batchId = randomUUID();
    const now = new Date();
    const fromClassIds = Object.keys(dto.class_mapping);

    return this.prisma.$transaction(async (tx) => {
      await tx.promotionBatch.create({
        data: {
          id: batchId,
          tenantId,
          branchId: dto.branch_id,
          fromSessionId: dto.from_session_id,
          toSessionId: dto.to_session_id,
          classMappingJson: dto.class_mapping as Prisma.InputJsonValue,
          status: "draft",
          createdAt: now,
        },
      });

      const students = await tx.student.findMany({
        where: {
          branchId: dto.branch_id,
          status: "enrolled",
          deletedAt: null,
          currentClassId: { in: fromClassIds },
        },
        select: { id: true, currentClassId: true, currentSectionId: true },
      });

      for (const student of students) {
        const toClassId = student.currentClassId ? (dto.class_mapping[student.currentClassId] ?? null) : null;
        await tx.promotionBatchItem.create({
          data: {
            id: randomUUID(),
            tenantId,
            promotionBatchId: batchId,
            studentId: student.id,
            fromClassId: student.currentClassId,
            fromSectionId: student.currentSectionId,
            toClassId,
            toSectionId: null,
            decision: "promote",
          },
        });
      }

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "promotion_batches",
        entityId: batchId,
        action: "create",
        summary: "Created promotion batch (draft)",
      });

      return this.loadBatch(tx, batchId);
    });
  }

  async getPromotionBatch(batchId: string) {
    return this.loadBatch(this.prisma, batchId);
  }

  private async loadBatch(client: Prisma.TransactionClient | PrismaService, batchId: string) {
    const batch = await client.promotionBatch.findUniqueOrThrow({ where: { id: batchId } });
    const items = await client.promotionBatchItem.findMany({
      where: { promotionBatchId: batchId },
      include: { student: true, fromClass: true, toClass: true },
      orderBy: { student: { firstName: "asc" } },
    });

    return {
      id: batch.id,
      branch_id: batch.branchId,
      from_session_id: batch.fromSessionId,
      to_session_id: batch.toSessionId,
      status: batch.status,
      items: items.map((i) => ({
        id: i.id,
        student_id: i.studentId,
        student_name: [i.student.firstName, i.student.lastName].filter(Boolean).join(" "),
        from_class_name: i.fromClass?.name ?? null,
        to_class_id: i.toClassId,
        to_class_name: i.toClass?.name ?? null,
        to_section_id: i.toSectionId,
        decision: i.decision,
      })),
    };
  }

  async setPromotionDecision(itemId: string, dto: SetPromotionDecisionDto) {
    return this.prisma.promotionBatchItem.update({
      where: { id: itemId },
      data: { decision: dto.decision, toClassId: dto.to_class_id ?? null, toSectionId: dto.to_section_id ?? null },
    });
  }

  // Applies every item's decision transactionally: promote inserts a
  // student_enrollments row for the new session and moves the student's
  // current class/section pointer; retain inserts an enrollment row back
  // into the *same* class (repeating the year) and leaves the pointer
  // as-is; withdraw marks the student withdrawn and writes no new-session
  // enrollment row. One audit_log row covers the whole batch.
  async executePromotionBatch(tenantId: string, actorUserId: string, batchId: string) {
    const batch = await this.prisma.promotionBatch.findUniqueOrThrow({ where: { id: batchId } });
    if (batch.status === "completed") {
      throw new BadRequestException("promotion batch already executed");
    }

    const items = await this.prisma.promotionBatchItem.findMany({ where: { promotionBatchId: batchId } });
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        if (item.decision === "promote") {
          if (!item.toClassId) {
            continue; // no target class chosen -- skip, admin must resolve
          }
          await tx.studentEnrollment.upsert({
            where: { studentId_academicSessionId: { studentId: item.studentId, academicSessionId: batch.toSessionId } },
            create: {
              id: randomUUID(),
              tenantId,
              branchId: batch.branchId,
              studentId: item.studentId,
              academicSessionId: batch.toSessionId,
              classId: item.toClassId,
              sectionId: item.toSectionId,
              status: "promoted",
              updatedAt: now,
            },
            update: { classId: item.toClassId, sectionId: item.toSectionId, status: "promoted", updatedAt: now, version: { increment: 1 } },
          });

          await tx.student.update({
            where: { id: item.studentId },
            data: { currentClassId: item.toClassId, currentSectionId: item.toSectionId, updatedAt: now, version: { increment: 1 } },
          });
        } else if (item.decision === "retain") {
          const student = await tx.student.findUniqueOrThrow({ where: { id: item.studentId } });
          if (!student.currentClassId) {
            continue;
          }
          await tx.studentEnrollment.upsert({
            where: { studentId_academicSessionId: { studentId: item.studentId, academicSessionId: batch.toSessionId } },
            create: {
              id: randomUUID(),
              tenantId,
              branchId: batch.branchId,
              studentId: item.studentId,
              academicSessionId: batch.toSessionId,
              classId: student.currentClassId,
              sectionId: item.fromSectionId,
              status: "retained",
              updatedAt: now,
            },
            update: {
              classId: student.currentClassId,
              sectionId: item.fromSectionId,
              status: "retained",
              updatedAt: now,
              version: { increment: 1 },
            },
          });
        } else if (item.decision === "withdraw") {
          await tx.student.update({
            where: { id: item.studentId },
            data: { status: "withdrawn", updatedAt: now, version: { increment: 1 } },
          });
        }
      }

      await tx.promotionBatch.update({
        where: { id: batchId },
        data: { status: "completed", executedAt: now, executedBy: actorUserId },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: batch.branchId,
        actorUserId,
        entityTable: "promotion_batches",
        entityId: batchId,
        action: "update",
        summary: `Executed promotion batch (${items.length} students)`,
      });
    });
  }
}
