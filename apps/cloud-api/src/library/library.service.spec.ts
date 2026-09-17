import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { LibraryService } from "./library.service.js";

function makePrismaMock() {
  return {
    libraryBook: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    libraryIssue: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaService & {
    libraryBook: { findMany: ReturnType<typeof vi.fn> };
    libraryIssue: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("LibraryService.listBooks", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: LibraryService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new LibraryService(prisma, makeAuditMock());
  });

  it("matches on isbn in addition to title and author", async () => {
    await service.listBooks("branch-1", "978-3");

    expect(prisma.libraryBook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { title: { contains: "978-3", mode: "insensitive" } },
            { author: { contains: "978-3", mode: "insensitive" } },
            { isbn: { contains: "978-3", mode: "insensitive" } },
          ],
        }),
      }),
    );
  });

  it("omits the OR clause when no search term is given", async () => {
    await service.listBooks("branch-1");

    expect(prisma.libraryBook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { branchId: "branch-1", deletedAt: null } }),
    );
  });
});

describe("LibraryService.listIssues", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: LibraryService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new LibraryService(prisma, makeAuditMock());
  });

  it("filters by student_id when provided", async () => {
    await service.listIssues("branch-1", { studentId: "student-1" });

    expect(prisma.libraryIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId: "student-1" }),
      }),
    );
  });

  it("filters by an issued_date range when from/to are provided", async () => {
    await service.listIssues("branch-1", { from: "2026-01-01", to: "2026-01-31" });

    expect(prisma.libraryIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          issuedDate: { gte: new Date("2026-01-01"), lte: new Date("2026-01-31") },
        }),
      }),
    );
  });

  it("still supports the existing status filter alongside the new ones", async () => {
    await service.listIssues("branch-1", { status: "issued", studentId: "student-1" });

    expect(prisma.libraryIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "issued", studentId: "student-1" }),
      }),
    );
  });
});

describe("LibraryService.getLibraryStats", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: LibraryService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new LibraryService(prisma, makeAuditMock());
  });

  it("sums total/available copies across the branch's books and reports issued/overdue counts", async () => {
    prisma.libraryBook.findMany.mockResolvedValue([
      { totalCopies: 3, availableCopies: 1 },
      { totalCopies: 5, availableCopies: 5 },
    ]);
    prisma.libraryIssue.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1);

    const stats = await service.getLibraryStats("branch-1");

    expect(stats).toEqual({
      total_books: 2,
      total_copies: 8,
      available_copies: 6,
      issued_count: 4,
      overdue_count: 1,
    });
  });

  it("counts overdue as issued books whose due date has already passed", async () => {
    await service.getLibraryStats("branch-1");

    expect(prisma.libraryIssue.count).toHaveBeenNthCalledWith(2, {
      where: { branchId: "branch-1", deletedAt: null, status: "issued", dueDate: { lt: expect.any(Date) } },
    });
  });
});
