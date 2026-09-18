import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { LibraryService } from "./library.service.js";

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

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("LibraryService.listBooks", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let service: LibraryService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    service = new LibraryService(db, makeAuditMock());
  });

  it("matches on isbn in addition to title and author", async () => {
    await service.listBooks("tenant-1", "branch-1", "978-3");

    const [, text, params] = db.query.mock.calls[0];
    expect(text).toMatch(/title ILIKE .* OR author ILIKE .* OR isbn ILIKE/);
    expect(params).toContain("%978-3%");
  });

  it("omits the search clause when no search term is given", async () => {
    await service.listBooks("tenant-1", "branch-1");

    const [, text, params] = db.query.mock.calls[0];
    expect(text).not.toMatch(/ILIKE/);
    expect(params).toEqual(["tenant-1", "branch-1"]);
  });
});

describe("LibraryService.updateBook", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let service: LibraryService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new LibraryService(db, makeAuditMock());
  });

  it("throws NotFoundException when the book doesn't exist for this tenant", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.updateBook("tenant-1", "actor-1", "book-1", { title: "New", total_copies: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects reducing total_copies below what's currently on loan", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "book-1", tenant_id: "tenant-1", total_copies: 5, available_copies: 1 }],
    });

    await expect(
      service.updateBook("tenant-1", "actor-1", "book-1", { title: "New", total_copies: 3 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("LibraryService.issueBook / returnBook", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let service: LibraryService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new LibraryService(db, makeAuditMock());
  });

  it("rejects issuing when no copies are available", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "book-1", tenant_id: "tenant-1", branch_id: "branch-1", total_copies: 2, available_copies: 0 }],
    });

    await expect(
      service.issueBook("tenant-1", "actor-1", { book_id: "book-1", student_id: "student-1", due_date: "2026-02-01" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("decrements available_copies and creates an issue record", async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: "book-1", tenant_id: "tenant-1", branch_id: "branch-1", total_copies: 2, available_copies: 1 }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "book-1", tenant_id: "tenant-1", available_copies: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: "issue-1", tenant_id: "tenant-1" }] });

    await service.issueBook("tenant-1", "actor-1", { book_id: "book-1", student_id: "student-1", due_date: "2026-02-01" });

    const updateCall = client.query.mock.calls[1];
    expect(updateCall[1]).toContain(0);
  });

  it("throws NotFoundException when returning an issue that doesn't exist for this tenant", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.returnBook("tenant-1", "issue-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("marks the issue returned and increments the book's available_copies", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "issue-1", tenant_id: "tenant-1", book_id: "book-1" }] }) // findOneForTenant issue
      .mockResolvedValueOnce({ rows: [{ id: "issue-1", tenant_id: "tenant-1", status: "returned" }] }) // updateRow issue
      .mockResolvedValueOnce({ rows: [{ id: "book-1", tenant_id: "tenant-1", available_copies: 1 }] }) // findOneForTenant book
      .mockResolvedValueOnce({ rows: [{ id: "book-1", tenant_id: "tenant-1", available_copies: 2 }] }); // updateRow book

    await service.returnBook("tenant-1", "issue-1");

    const bookUpdateCall = client.query.mock.calls[3];
    expect(bookUpdateCall[1]).toContain(2);
  });
});

describe("LibraryService.listIssues", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let service: LibraryService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    service = new LibraryService(db, makeAuditMock());
  });

  it("filters by student_id when provided", async () => {
    await service.listIssues("tenant-1", "branch-1", { studentId: "student-1" });

    const [, text, params] = db.query.mock.calls[0];
    expect(text).toMatch(/li\.student_id = \$\d/);
    expect(params).toContain("student-1");
  });

  it("filters by an issued_date range when from/to are provided", async () => {
    await service.listIssues("tenant-1", "branch-1", { from: "2026-01-01", to: "2026-01-31" });

    const [, , params] = db.query.mock.calls[0];
    expect(params).toContainEqual(new Date("2026-01-01"));
    expect(params).toContainEqual(new Date("2026-01-31"));
  });

  it("still supports the existing status filter alongside the new ones", async () => {
    await service.listIssues("tenant-1", "branch-1", { status: "issued", studentId: "student-1" });

    const [, , params] = db.query.mock.calls[0];
    expect(params).toEqual(["tenant-1", "branch-1", "issued", "student-1"]);
  });
});

describe("LibraryService.getLibraryStats", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let service: LibraryService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    service = new LibraryService(db, makeAuditMock());
  });

  it("sums total/available copies across the branch's books and reports issued/overdue counts", async () => {
    db.queryOne
      .mockResolvedValueOnce({ total_books: "2", total_copies: "8", available_copies: "6" })
      .mockResolvedValueOnce({ count: "4" })
      .mockResolvedValueOnce({ count: "1" });

    const stats = await service.getLibraryStats("tenant-1", "branch-1");

    expect(stats).toEqual({
      total_books: 2,
      total_copies: 8,
      available_copies: 6,
      issued_count: 4,
      overdue_count: 1,
    });
  });

  it("counts overdue as issued books whose due date has already passed", async () => {
    db.queryOne
      .mockResolvedValueOnce({ total_books: "0", total_copies: "0", available_copies: "0" })
      .mockResolvedValueOnce({ count: "0" })
      .mockResolvedValueOnce({ count: "0" });

    await service.getLibraryStats("tenant-1", "branch-1");

    const [, overdueText] = db.queryOne.mock.calls[2];
    expect(overdueText).toMatch(/status = 'issued' AND due_date < now\(\)/);
  });
});
