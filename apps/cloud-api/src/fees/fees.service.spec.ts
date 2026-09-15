import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { FeesService } from "./fees.service.js";

function makePrismaMock() {
  const tx = {
    feeStructure: { update: vi.fn().mockResolvedValue({}), findUnique: vi.fn() },
    student: { findMany: vi.fn().mockResolvedValue([]) },
    feeInvoice: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({}),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    feePayment: { create: vi.fn() },
  };
  return {
    feeCategory: { findFirst: vi.fn() },
    feeStructure: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
  } as unknown as PrismaService & {
    feeCategory: { findFirst: ReturnType<typeof vi.fn> };
    feeStructure: { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    __tx: typeof tx;
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("FeesService.createFeeStructure", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: FeesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new FeesService(prisma, audit);
  });

  it("rejects a fee_type with no matching FeeCategory for the tenant", async () => {
    prisma.feeCategory.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.createFeeStructure("tenant-1", {
        branch_id: "branch-1",
        academic_session_id: "session-1",
        name: "Sports",
        amount: 500000,
        frequency: "annual",
        fee_type: "sports",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.feeStructure.create).not.toHaveBeenCalled();
  });

  it("defaults to 'tuition' and accepts it when a matching category exists", async () => {
    prisma.feeCategory.findFirst.mockResolvedValueOnce({ id: "cat-1", key: "tuition" });

    await service.createFeeStructure("tenant-1", {
      branch_id: "branch-1",
      academic_session_id: "session-1",
      name: "Tuition",
      amount: 1000000,
      frequency: "annual",
    });

    expect(prisma.feeCategory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: "tuition" }) }),
    );
    expect(prisma.feeStructure.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ feeType: "tuition" }) }),
    );
  });
});

describe("FeesService.generateInvoicesBulk", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: FeesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new FeesService(prisma, audit);
  });

  it("loops generateInvoices across every matching structure and sums the created count", async () => {
    prisma.feeStructure.findMany.mockResolvedValueOnce([
      { id: "struct-1" },
      { id: "struct-2" },
    ]);
    prisma.__tx.feeStructure.findUnique
      .mockResolvedValueOnce({ id: "struct-1", branchId: "branch-1", classId: null, academicSessionId: "session-1", amount: 1000 })
      .mockResolvedValueOnce({ id: "struct-2", branchId: "branch-1", classId: null, academicSessionId: "session-1", amount: 2000 });
    prisma.__tx.student.findMany
      .mockResolvedValueOnce([{ id: "student-1" }, { id: "student-2" }])
      .mockResolvedValueOnce([{ id: "student-1" }]);
    prisma.__tx.feeInvoice.findMany.mockResolvedValue([]);

    const result = await service.generateInvoicesBulk("tenant-1", "actor-1", "branch-1", "session-1");

    expect(result.created).toBe(3);
    expect(result.by_structure).toEqual([
      { fee_structure_id: "struct-1", created: 2 },
      { fee_structure_id: "struct-2", created: 1 },
    ]);
    expect(prisma.__tx.feeInvoice.createMany).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("scopes to the given fee_structure_ids subset when provided", async () => {
    prisma.feeStructure.findMany.mockResolvedValueOnce([]);

    await service.generateInvoicesBulk("tenant-1", "actor-1", "branch-1", "session-1", ["struct-1"]);

    expect(prisma.feeStructure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["struct-1"] } }) }),
    );
  });

  it("skips the audit record when nothing was created", async () => {
    prisma.feeStructure.findMany.mockResolvedValueOnce([]);

    const result = await service.generateInvoicesBulk("tenant-1", "actor-1", "branch-1", "session-1");

    expect(result.created).toBe(0);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe("FeesService.recordPaymentBatch", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: FeesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new FeesService(prisma, audit);
  });

  it("creates one FeePayment per entry sharing the batch's receipt number and updates each invoice independently", async () => {
    prisma.__tx.feePayment.create
      .mockResolvedValueOnce({ id: "payment-1" })
      .mockResolvedValueOnce({ id: "payment-2" });
    prisma.__tx.feeInvoice.findUniqueOrThrow
      .mockResolvedValueOnce({ id: "inv-1", amountDue: 1000, amountPaid: 0 })
      .mockResolvedValueOnce({ id: "inv-2", amountDue: 2000, amountPaid: 500 });

    const result = await service.recordPaymentBatch("tenant-1", "actor-1", {
      entries: [
        { invoice_id: "inv-1", amount: 1000 },
        { invoice_id: "inv-2", amount: 1500 },
      ],
      payment_method: "cash",
      payment_date: "2026-01-15",
      receipt_number: "RCPT-001",
    });

    expect(result).toEqual([{ id: "payment-1" }, { id: "payment-2" }]);
    expect(prisma.__tx.feePayment.create).toHaveBeenCalledTimes(2);
    expect(prisma.__tx.feePayment.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ invoiceId: "inv-1", amount: 1000, receiptNumber: "RCPT-001" }) }),
    );
    expect(prisma.__tx.feePayment.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ invoiceId: "inv-2", amount: 1500, receiptNumber: "RCPT-001" }) }),
    );
    expect(prisma.__tx.feeInvoice.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: "inv-1" }, data: expect.objectContaining({ amountPaid: 1000, status: "paid" }) }),
    );
    expect(prisma.__tx.feeInvoice.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: "inv-2" }, data: expect.objectContaining({ amountPaid: 2000, status: "paid" }) }),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      prisma.__tx,
      expect.objectContaining({ summary: expect.stringContaining("2500 paise across 2 invoice(s)") }),
    );
  });
});
