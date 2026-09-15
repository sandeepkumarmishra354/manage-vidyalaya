import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { FeeCategoriesService } from "./fee-categories.service.js";

function makePrismaMock() {
  return {
    feeCategory: { findFirst: vi.fn(), update: vi.fn() },
    feeStructure: { count: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ feeCategory: { create: vi.fn().mockResolvedValue({ id: "cat-1" }), update: vi.fn().mockResolvedValue({}) } }),
    ),
  } as unknown as PrismaService & {
    feeCategory: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    feeStructure: { count: ReturnType<typeof vi.fn> };
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("FeeCategoriesService.createCategory", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: FeeCategoriesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new FeeCategoriesService(prisma, audit);
  });

  it("derives a slug key from the display name", async () => {
    prisma.feeCategory.findFirst.mockResolvedValueOnce(null);

    await service.createCategory("tenant-1", "actor-1", { name: "Sports Fee" });

    expect(prisma.feeCategory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: "sports_fee" }) }),
    );
  });

  it("rejects a name that produces an empty slug", async () => {
    await expect(service.createCategory("tenant-1", "actor-1", { name: "***" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects a duplicate category (same slug already exists)", async () => {
    prisma.feeCategory.findFirst.mockResolvedValueOnce({ id: "existing" });

    await expect(service.createCategory("tenant-1", "actor-1", { name: "Tuition" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("FeeCategoriesService.deleteCategory", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: FeeCategoriesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new FeeCategoriesService(prisma, audit);
  });

  it("throws NotFoundException when the category doesn't exist", async () => {
    prisma.feeCategory.findFirst.mockResolvedValueOnce(null);

    await expect(service.deleteCategory("tenant-1", "actor-1", "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects deleting a default (system-seeded) category", async () => {
    prisma.feeCategory.findFirst.mockResolvedValueOnce({ id: "cat-1", name: "Tuition", key: "tuition", isSystem: true });

    await expect(service.deleteCategory("tenant-1", "actor-1", "cat-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects deleting a category still referenced by a fee structure", async () => {
    prisma.feeCategory.findFirst.mockResolvedValueOnce({ id: "cat-1", name: "Custom", key: "custom", isSystem: false });
    prisma.feeStructure.count.mockResolvedValueOnce(2);

    await expect(service.deleteCategory("tenant-1", "actor-1", "cat-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("deletes a custom, unreferenced category", async () => {
    prisma.feeCategory.findFirst.mockResolvedValueOnce({ id: "cat-1", name: "Custom", key: "custom", isSystem: false });
    prisma.feeStructure.count.mockResolvedValueOnce(0);

    await expect(service.deleteCategory("tenant-1", "actor-1", "cat-1")).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
