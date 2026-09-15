import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { StaffCategoriesService } from "./staff-categories.service.js";

function makePrismaMock() {
  return {
    staffCategory: { findFirst: vi.fn(), update: vi.fn() },
    staff: { count: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ staffCategory: { create: vi.fn().mockResolvedValue({ id: "cat-1" }), update: vi.fn().mockResolvedValue({}) } }),
    ),
  } as unknown as PrismaService & {
    staffCategory: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    staff: { count: ReturnType<typeof vi.fn> };
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("StaffCategoriesService.deleteCategory", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StaffCategoriesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new StaffCategoriesService(prisma, audit);
  });

  it("throws NotFoundException when the category doesn't exist", async () => {
    prisma.staffCategory.findFirst.mockResolvedValueOnce(null);

    await expect(service.deleteCategory("tenant-1", "actor-1", "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects deleting a default (system-seeded) category", async () => {
    prisma.staffCategory.findFirst.mockResolvedValueOnce({ id: "cat-1", name: "Teacher", isSystem: true });

    await expect(service.deleteCategory("tenant-1", "actor-1", "cat-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects deleting a category still assigned to staff", async () => {
    prisma.staffCategory.findFirst.mockResolvedValueOnce({ id: "cat-1", name: "Custom", isSystem: false });
    prisma.staff.count.mockResolvedValueOnce(2);

    await expect(service.deleteCategory("tenant-1", "actor-1", "cat-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("deletes a custom, unassigned category", async () => {
    prisma.staffCategory.findFirst.mockResolvedValueOnce({ id: "cat-1", name: "Custom", isSystem: false });
    prisma.staff.count.mockResolvedValueOnce(0);

    await expect(service.deleteCategory("tenant-1", "actor-1", "cat-1")).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
