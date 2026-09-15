import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { PromotionService } from "./promotion.service.js";

function makeTxMock() {
  return {
    studentEnrollment: { upsert: vi.fn() },
    student: {
      update: vi.fn(),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ currentClassId: "class-from" }),
    },
    promotionBatch: { update: vi.fn() },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    promotionBatch: { findUniqueOrThrow: vi.fn() },
    promotionBatchItem: { findMany: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("PromotionService.executePromotionBatch", () => {
  let tx: ReturnType<typeof makeTxMock>;
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: PromotionService;

  beforeEach(() => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);
    audit = makeAuditMock();
    service = new PromotionService(prisma, audit);

    (prisma.promotionBatch.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "batch-1",
      branchId: "branch-1",
      toSessionId: "session-2",
      status: "draft",
    });
  });

  it("refuses to re-execute an already-completed batch", async () => {
    (prisma.promotionBatch.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "batch-1",
      status: "completed",
    });
    (prisma.promotionBatchItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(service.executePromotionBatch("tenant-a", "actor-1", "batch-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("promote: writes a student_enrollments row and moves the current-class pointer", async () => {
    (prisma.promotionBatchItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "item-1",
        studentId: "student-promoted",
        decision: "promote",
        toClassId: "class-9",
        toSectionId: "section-a",
        fromSectionId: "section-old",
      },
    ]);

    await service.executePromotionBatch("tenant-a", "actor-1", "batch-1");

    expect(tx.studentEnrollment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId_academicSessionId: { studentId: "student-promoted", academicSessionId: "session-2" } },
        create: expect.objectContaining({ classId: "class-9", sectionId: "section-a", status: "promoted" }),
      }),
    );
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: "student-promoted" },
      data: expect.objectContaining({ currentClassId: "class-9", currentSectionId: "section-a" }),
    });
  });

  it("promote: skips an item with no target class chosen, writing nothing for it", async () => {
    (prisma.promotionBatchItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "item-1", studentId: "student-unresolved", decision: "promote", toClassId: null, toSectionId: null },
    ]);

    await service.executePromotionBatch("tenant-a", "actor-1", "batch-1");

    expect(tx.studentEnrollment.upsert).not.toHaveBeenCalled();
    expect(tx.student.update).not.toHaveBeenCalled();
  });

  it("retain: writes a student_enrollments row back into the same class and leaves the pointer untouched", async () => {
    (prisma.promotionBatchItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "item-1", studentId: "student-retained", decision: "retain", fromSectionId: "section-old" },
    ]);

    await service.executePromotionBatch("tenant-a", "actor-1", "batch-1");

    expect(tx.studentEnrollment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ classId: "class-from", sectionId: "section-old", status: "retained" }),
      }),
    );
    // retain never moves the student's current-class pointer -- repeating
    // the year means staying in the same class, not a new enrollment row.
    expect(tx.student.update).not.toHaveBeenCalled();
  });

  it("withdraw: marks the student withdrawn and writes no new-session enrollment row", async () => {
    (prisma.promotionBatchItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "item-1", studentId: "student-withdrawn", decision: "withdraw" },
    ]);

    await service.executePromotionBatch("tenant-a", "actor-1", "batch-1");

    expect(tx.studentEnrollment.upsert).not.toHaveBeenCalled();
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: "student-withdrawn" },
      data: expect.objectContaining({ status: "withdrawn" }),
    });
  });

  it("marks the batch completed and records one audit entry for the whole batch", async () => {
    (prisma.promotionBatchItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "item-1", studentId: "s1", decision: "withdraw" },
      { id: "item-2", studentId: "s2", decision: "withdraw" },
    ]);

    await service.executePromotionBatch("tenant-a", "actor-1", "batch-1");

    expect(tx.promotionBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "batch-1" }, data: expect.objectContaining({ status: "completed" }) }),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ summary: expect.stringContaining("2 students") }),
    );
  });
});
