import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { FeesService } from "../fees/fees.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { StudentsService } from "../students/students.service.js";
import { FeeDiscountsService } from "./fee-discounts.service.js";

function makePrismaMock() {
  const tx = {
    feeDiscount: { create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
    studentFeeDiscount: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  return {
    feeDiscount: { findFirst: vi.fn(), count: vi.fn() },
    studentFeeDiscount: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
  } as unknown as PrismaService & {
    feeDiscount: { findFirst: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
    studentFeeDiscount: { count: ReturnType<typeof vi.fn> };
    __tx: typeof tx;
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

function makeFeesMock() {
  return { reapplyDiscountsForStudent: vi.fn() } as unknown as FeesService;
}

function makeStudentsMock() {
  return { getSiblings: vi.fn() } as unknown as StudentsService;
}

describe("FeeDiscountsService.createDiscount", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: FeeDiscountsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new FeeDiscountsService(prisma, makeAuditMock(), makeFeesMock(), makeStudentsMock());
  });

  it("rejects a duplicate discount name (same slug) for the tenant", async () => {
    prisma.feeDiscount.findFirst.mockResolvedValueOnce({ id: "existing" });

    await expect(
      service.createDiscount("tenant-1", "actor-1", { name: "Sibling Discount", discount_type: "percentage", value: 10 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.__tx.feeDiscount.create).not.toHaveBeenCalled();
  });

  it("creates a discount with a slugified key", async () => {
    prisma.feeDiscount.findFirst.mockResolvedValueOnce(null);

    await service.createDiscount("tenant-1", "actor-1", { name: "Sibling Discount", discount_type: "percentage", value: 10 });

    expect(prisma.__tx.feeDiscount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ key: "sibling_discount", discountType: "percentage", value: 10 }) }),
    );
  });
});

describe("FeeDiscountsService.deleteDiscount", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: FeeDiscountsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new FeeDiscountsService(prisma, makeAuditMock(), makeFeesMock(), makeStudentsMock());
  });

  it("throws NotFoundException when the discount doesn't exist", async () => {
    prisma.feeDiscount.findFirst.mockResolvedValueOnce(null);

    await expect(service.deleteDiscount("tenant-1", "actor-1", "disc-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("blocks deletion while any active assignment exists", async () => {
    prisma.feeDiscount.findFirst.mockResolvedValueOnce({ id: "disc-1", name: "Sibling Discount" });
    prisma.studentFeeDiscount.count.mockResolvedValueOnce(2);

    await expect(service.deleteDiscount("tenant-1", "actor-1", "disc-1")).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("FeeDiscountsService.assignDiscountToStudents", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let fees: ReturnType<typeof makeFeesMock>;
  let service: FeeDiscountsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    fees = makeFeesMock();
    service = new FeeDiscountsService(prisma, makeAuditMock(), fees, makeStudentsMock());
    prisma.feeDiscount.findFirst.mockResolvedValue({ id: "disc-1", name: "Sibling Discount" });
  });

  it("does not reapply to existing invoices when the checkbox is unchecked", async () => {
    await service.assignDiscountToStudents("tenant-1", "actor-1", "disc-1", {
      student_ids: ["student-1"],
      apply_to_existing_invoices: false,
    });

    expect(fees.reapplyDiscountsForStudent).not.toHaveBeenCalled();
  });

  it("reapplies to existing invoices for every assigned student when checked", async () => {
    await service.assignDiscountToStudents("tenant-1", "actor-1", "disc-1", {
      student_ids: ["student-1", "student-2"],
      apply_to_existing_invoices: true,
    });

    expect(fees.reapplyDiscountsForStudent).toHaveBeenCalledTimes(2);
    expect(fees.reapplyDiscountsForStudent).toHaveBeenCalledWith("tenant-1", "actor-1", "student-1", prisma.__tx);
    expect(fees.reapplyDiscountsForStudent).toHaveBeenCalledWith("tenant-1", "actor-1", "student-2", prisma.__tx);
  });
});
