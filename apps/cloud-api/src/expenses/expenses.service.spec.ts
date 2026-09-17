import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { StorageService } from "../storage/storage.service.js";
import { ExpensesService } from "./expenses.service.js";

function makePrismaMock() {
  const tx = { expense: { create: vi.fn(), update: vi.fn() } };
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
    expense: { findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  } as unknown as PrismaService & {
    __tx: typeof tx;
    expense: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
  };
}

function makeStorageMock() {
  return {
    createUploadUrl: vi.fn(),
    createDownloadUrl: vi.fn(),
    deleteObject: vi.fn(),
  } as unknown as StorageService & {
    createUploadUrl: ReturnType<typeof vi.fn>;
    createDownloadUrl: ReturnType<typeof vi.fn>;
    deleteObject: ReturnType<typeof vi.fn>;
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("ExpensesService", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let storage: ReturnType<typeof makeStorageMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: ExpensesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    storage = makeStorageMock();
    audit = makeAuditMock();
    service = new ExpensesService(prisma, storage, audit);
  });

  describe("create", () => {
    it("records an expense and an audit entry", async () => {
      prisma.__tx.expense.create.mockResolvedValueOnce({
        id: "exp-1",
        branchId: "branch-1",
        categoryId: "cat-1",
        description: "Chalk and dusters",
        amount: 50000,
        expenseDate: new Date("2026-04-01"),
        paymentMode: "cash",
        vendorName: "Local Stationers",
        receiptStorageKey: null,
        recordedByUserId: "user-1",
        createdAt: new Date(),
      });

      const result = await service.create("tenant-1", "user-1", {
        branch_id: "branch-1",
        category_id: "cat-1",
        description: "Chalk and dusters",
        amount: 50000,
        expense_date: "2026-04-01",
        payment_mode: "cash",
        vendor_name: "Local Stationers",
      });

      expect(prisma.__tx.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: "tenant-1", branchId: "branch-1", amount: 50000 }),
        }),
      );
      expect(result.has_receipt).toBe(false);
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("update / remove", () => {
    it("404s updating an expense outside the tenant", async () => {
      prisma.expense.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.update("tenant-1", "user-1", "exp-x", {
          description: "x",
          amount: 100,
          expense_date: "2026-04-01",
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("soft-deletes and best-effort removes an attached receipt", async () => {
      prisma.expense.findFirst.mockResolvedValueOnce({
        id: "exp-1",
        branchId: "branch-1",
        description: "Old expense",
        receiptStorageKey: "receipt-abc.pdf",
      });

      await service.remove("tenant-1", "user-1", "exp-1");

      expect(prisma.__tx.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "exp-1" }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
      );
      expect(storage.deleteObject).toHaveBeenCalledWith("receipt-abc.pdf");
    });
  });

  describe("summary", () => {
    it("aggregates totals by category and by month", async () => {
      prisma.expense.groupBy.mockResolvedValueOnce([
        { categoryId: "cat-1", _sum: { amount: 30000 } },
        { categoryId: "cat-2", _sum: { amount: 20000 } },
      ]);
      prisma.expense.findMany.mockResolvedValueOnce([
        { amount: 30000, expenseDate: new Date("2026-04-05") },
        { amount: 20000, expenseDate: new Date("2026-05-10") },
      ]);

      const result = await service.summary("tenant-1", "branch-1");

      expect(result.total).toBe(50000);
      expect(result.by_category).toEqual([
        { category_id: "cat-1", amount: 30000 },
        { category_id: "cat-2", amount: 20000 },
      ]);
      expect(result.by_month).toEqual([
        { month: "2026-04", amount: 30000 },
        { month: "2026-05", amount: 20000 },
      ]);
    });
  });

  describe("receipt flow", () => {
    it("404s requesting a download URL with no receipt attached", async () => {
      prisma.expense.findFirst.mockResolvedValueOnce({ id: "exp-1", receiptStorageKey: null });
      await expect(service.getReceiptDownloadUrl("tenant-1", "exp-1")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("resolves a signed download URL for an attached receipt", async () => {
      prisma.expense.findFirst.mockResolvedValueOnce({ id: "exp-1", receiptStorageKey: "receipt-1.pdf" });
      storage.createDownloadUrl.mockResolvedValueOnce({ url: "http://x", expires_at: "now" });

      const result = await service.getReceiptDownloadUrl("tenant-1", "exp-1");

      expect(storage.createDownloadUrl).toHaveBeenCalledWith("receipt-1.pdf");
      expect(result.url).toBe("http://x");
    });
  });
});
