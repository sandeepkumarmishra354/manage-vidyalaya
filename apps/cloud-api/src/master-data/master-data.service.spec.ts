import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { ScopedAccessService } from "../common/scoped-access.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { MasterDataService } from "./master-data.service.js";

function makePrismaMock() {
  return {
    masterDataItem: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ masterDataItem: { create: vi.fn().mockResolvedValue({ id: "item-1" }), update: vi.fn().mockResolvedValue({}) } }),
    ),
  } as unknown as PrismaService & {
    masterDataItem: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

function makeScopedAccessMock(hasPermission = true) {
  return { hasPermission: vi.fn().mockResolvedValue(hasPermission) } as unknown as ScopedAccessService;
}

describe("MasterDataService.createItem", () => {
  it("rejects an unknown type", async () => {
    const prisma = makePrismaMock();
    const service = new MasterDataService(prisma, makeAuditMock(), makeScopedAccessMock());

    await expect(
      service.createItem("tenant-1", "actor-1", { type: "not_a_real_type", name: "X" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects when the actor lacks that type's manage permission", async () => {
    const prisma = makePrismaMock();
    const scopedAccess = makeScopedAccessMock(false);
    const service = new MasterDataService(prisma, makeAuditMock(), scopedAccess);

    await expect(
      service.createItem("tenant-1", "actor-1", { type: "religion", name: "Buddhism" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(scopedAccess.hasPermission).toHaveBeenCalledWith("actor-1", "master_data.manage_religion");
  });

  it("creates the item when permitted", async () => {
    const prisma = makePrismaMock();
    const audit = makeAuditMock();
    const service = new MasterDataService(prisma, audit, makeScopedAccessMock(true));

    await expect(
      service.createItem("tenant-1", "actor-1", { type: "religion", name: "Buddhism" }),
    ).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("MasterDataService.deleteItem", () => {
  it("throws NotFoundException when the item doesn't exist", async () => {
    const prisma = makePrismaMock();
    prisma.masterDataItem.findFirst.mockResolvedValueOnce(null);
    const service = new MasterDataService(prisma, makeAuditMock(), makeScopedAccessMock());

    await expect(service.deleteItem("tenant-1", "actor-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects deleting a default (system-seeded) value", async () => {
    const prisma = makePrismaMock();
    prisma.masterDataItem.findFirst.mockResolvedValueOnce({ id: "item-1", type: "gender", name: "Male", isSystem: true });
    const service = new MasterDataService(prisma, makeAuditMock(), makeScopedAccessMock());

    await expect(service.deleteItem("tenant-1", "actor-1", "item-1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects when the actor lacks that type's manage permission", async () => {
    const prisma = makePrismaMock();
    prisma.masterDataItem.findFirst.mockResolvedValueOnce({ id: "item-1", type: "religion", name: "Custom", isSystem: false });
    const scopedAccess = makeScopedAccessMock(false);
    const service = new MasterDataService(prisma, makeAuditMock(), scopedAccess);

    await expect(service.deleteItem("tenant-1", "actor-1", "item-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("deletes a custom value when permitted", async () => {
    const prisma = makePrismaMock();
    const audit = makeAuditMock();
    prisma.masterDataItem.findFirst.mockResolvedValueOnce({ id: "item-1", type: "religion", name: "Custom", isSystem: false });
    const service = new MasterDataService(prisma, audit, makeScopedAccessMock(true));

    await expect(service.deleteItem("tenant-1", "actor-1", "item-1")).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
