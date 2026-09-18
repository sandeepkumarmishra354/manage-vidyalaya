import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import type { StorageService } from "../storage/storage.service.js";
import { ExpensesService } from "./expenses.service.js";

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
}

function makeDbMock() {
  const client: FakeClient = { query: vi.fn() };
  const db = {
    withTransaction: vi.fn(async (_tenantId: string, fn: (client: FakeClient) => unknown) => fn(client)),
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn(),
  } as unknown as DbService & {
    query: ReturnType<typeof vi.fn>;
    queryOne: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
  };
  return { db, client };
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
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let storage: ReturnType<typeof makeStorageMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: ExpensesService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    storage = makeStorageMock();
    audit = makeAuditMock();
    service = new ExpensesService(db, storage, audit);
  });

  describe("create", () => {
    it("records an expense and an audit entry", async () => {
      client.query.mockResolvedValueOnce({
        rows: [
          {
            id: "exp-1",
            tenant_id: "tenant-1",
            branch_id: "branch-1",
            category_id: "cat-1",
            description: "Chalk and dusters",
            amount: 50000,
            expense_date: new Date("2026-04-01"),
            payment_mode: "cash",
            vendor_name: "Local Stationers",
            receipt_storage_key: null,
            recorded_by_user_id: "user-1",
            created_at: new Date(),
          },
        ],
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

      const [text, params] = client.query.mock.calls[0];
      expect(text).toMatch(/INSERT INTO expenses/);
      expect(params).toContain("tenant-1");
      expect(params).toContain("branch-1");
      expect(params).toContain(50000);
      expect(result.has_receipt).toBe(false);
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe("update / remove", () => {
    it("404s updating an expense outside the tenant", async () => {
      db.queryOne.mockResolvedValueOnce(null);
      await expect(
        service.update("tenant-1", "user-1", "exp-x", {
          description: "x",
          amount: 100,
          expense_date: "2026-04-01",
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("soft-deletes and best-effort removes an attached receipt", async () => {
      db.queryOne.mockResolvedValueOnce({
        id: "exp-1",
        tenant_id: "tenant-1",
        branch_id: "branch-1",
        description: "Old expense",
        receipt_storage_key: "receipt-abc.pdf",
      });
      client.query.mockResolvedValueOnce({ rows: [{ id: "exp-1", tenant_id: "tenant-1" }] });

      await service.remove("tenant-1", "user-1", "exp-1");

      const [text] = client.query.mock.calls[0];
      expect(text).toMatch(/UPDATE expenses SET/);
      expect(storage.deleteObject).toHaveBeenCalledWith("receipt-abc.pdf");
    });
  });

  describe("summary", () => {
    it("aggregates totals by category and by month", async () => {
      db.query
        .mockResolvedValueOnce([
          { category_id: "cat-1", amount: "30000" },
          { category_id: "cat-2", amount: "20000" },
        ])
        .mockResolvedValueOnce([
          { amount: 30000, expense_date: new Date("2026-04-05") },
          { amount: 20000, expense_date: new Date("2026-05-10") },
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
      db.queryOne.mockResolvedValueOnce({ id: "exp-1", tenant_id: "tenant-1", receipt_storage_key: null });
      await expect(service.getReceiptDownloadUrl("tenant-1", "exp-1")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("resolves a signed download URL for an attached receipt", async () => {
      db.queryOne.mockResolvedValueOnce({ id: "exp-1", tenant_id: "tenant-1", receipt_storage_key: "receipt-1.pdf" });
      storage.createDownloadUrl.mockResolvedValueOnce({ url: "http://x", expires_at: "now" });

      const result = await service.getReceiptDownloadUrl("tenant-1", "exp-1");

      expect(storage.createDownloadUrl).toHaveBeenCalledWith("receipt-1.pdf");
      expect(result.url).toBe("http://x");
    });
  });
});
