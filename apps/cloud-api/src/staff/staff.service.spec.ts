import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { StaffService } from "./staff.service.js";

function makePrismaMock() {
  const tx = {
    section: { findFirst: vi.fn(), update: vi.fn() },
  };
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
  } as unknown as PrismaService & { __tx: typeof tx };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("StaffService.setClassTeacher", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StaffService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new StaffService(prisma, audit);
  });

  it("rejects assigning a staff member who is already class teacher of a different section", async () => {
    prisma.__tx.section.findFirst.mockResolvedValueOnce({
      id: "section-other",
      class: { name: "Class 8" },
      name: "B",
    });

    await expect(
      service.setClassTeacher("tenant-1", "actor-1", "section-a", { staff_id: "staff-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.__tx.section.update).not.toHaveBeenCalled();
  });

  it("allows assigning a staff member with no conflicting section", async () => {
    prisma.__tx.section.findFirst.mockResolvedValueOnce(null);
    prisma.__tx.section.update.mockResolvedValueOnce({ id: "section-a", classTeacherStaffId: "staff-1" });

    const result = await service.setClassTeacher("tenant-1", "actor-1", "section-a", { staff_id: "staff-1" });

    expect(result).toEqual({ id: "section-a", classTeacherStaffId: "staff-1" });
    expect(audit.record).toHaveBeenCalled();
  });

  it("does not conflict-check when clearing the class teacher (staff_id null)", async () => {
    prisma.__tx.section.update.mockResolvedValueOnce({ id: "section-a", classTeacherStaffId: null });

    await service.setClassTeacher("tenant-1", "actor-1", "section-a", { staff_id: null });

    expect(prisma.__tx.section.findFirst).not.toHaveBeenCalled();
  });

  it("excludes the section being updated from the conflict check", async () => {
    prisma.__tx.section.findFirst.mockResolvedValueOnce(null);
    prisma.__tx.section.update.mockResolvedValueOnce({ id: "section-a", classTeacherStaffId: "staff-1" });

    await service.setClassTeacher("tenant-1", "actor-1", "section-a", { staff_id: "staff-1" });

    expect(prisma.__tx.section.findFirst).toHaveBeenCalledWith({
      where: { classTeacherStaffId: "staff-1", deletedAt: null, id: { not: "section-a" } },
      include: { class: true },
    });
  });
});
