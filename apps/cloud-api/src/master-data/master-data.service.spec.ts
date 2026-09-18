import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { ScopedAccessService } from "../common/scoped-access.service.js";
import type { DbService } from "../db/db.service.js";
import { MasterDataService } from "./master-data.service.js";

// DbService.withTransaction hands the callback a client-shaped object whose
// `query` is the one thing every tenant-repo helper (findOneForTenant,
// insertRow, updateRow, ...) ultimately calls -- mocking at that level, in
// call order, is the raw-pg equivalent of the old per-Prisma-model mocks.
interface FakeClient {
  query: ReturnType<typeof vi.fn>;
}

function makeDbMock() {
  const client: FakeClient = { query: vi.fn() };
  const db = {
    withTransaction: vi.fn(async (_tenantId: string, fn: (client: FakeClient) => unknown) => fn(client)),
  } as unknown as DbService;
  return { db, client };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

function makeScopedAccessMock(hasPermission = true) {
  return { hasPermission: vi.fn().mockResolvedValue(hasPermission) } as unknown as ScopedAccessService;
}

describe("MasterDataService.createItem", () => {
  it("rejects an unknown type", async () => {
    const { db } = makeDbMock();
    const service = new MasterDataService(db, makeAuditMock(), makeScopedAccessMock());

    await expect(
      service.createItem("tenant-1", "actor-1", { type: "not_a_real_type", name: "X" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects when the actor lacks that type's manage permission", async () => {
    const { db } = makeDbMock();
    const scopedAccess = makeScopedAccessMock(false);
    const service = new MasterDataService(db, makeAuditMock(), scopedAccess);

    await expect(
      service.createItem("tenant-1", "actor-1", { type: "religion", name: "Buddhism" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(scopedAccess.hasPermission).toHaveBeenCalledWith("tenant-1", "actor-1", "master_data.manage_religion");
  });

  it("creates the item when permitted", async () => {
    const { db, client } = makeDbMock();
    client.query.mockResolvedValueOnce({
      rows: [{ id: "item-1", tenant_id: "tenant-1", type: "religion", name: "Buddhism", is_system: false }],
    });
    const audit = makeAuditMock();
    const service = new MasterDataService(db, audit, makeScopedAccessMock(true));

    await expect(
      service.createItem("tenant-1", "actor-1", { type: "religion", name: "Buddhism" }),
    ).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("MasterDataService.deleteItem", () => {
  it("throws NotFoundException when the item doesn't exist", async () => {
    const { db, client } = makeDbMock();
    client.query.mockResolvedValueOnce({ rows: [] });
    const service = new MasterDataService(db, makeAuditMock(), makeScopedAccessMock());

    await expect(service.deleteItem("tenant-1", "actor-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects deleting a default (system-seeded) value", async () => {
    const { db, client } = makeDbMock();
    client.query.mockResolvedValueOnce({
      rows: [{ id: "item-1", tenant_id: "tenant-1", type: "gender", name: "Male", is_system: true }],
    });
    const service = new MasterDataService(db, makeAuditMock(), makeScopedAccessMock());

    await expect(service.deleteItem("tenant-1", "actor-1", "item-1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects when the actor lacks that type's manage permission", async () => {
    const { db, client } = makeDbMock();
    client.query.mockResolvedValueOnce({
      rows: [{ id: "item-1", tenant_id: "tenant-1", type: "religion", name: "Custom", is_system: false }],
    });
    const scopedAccess = makeScopedAccessMock(false);
    const service = new MasterDataService(db, makeAuditMock(), scopedAccess);

    await expect(service.deleteItem("tenant-1", "actor-1", "item-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("deletes a custom value when permitted", async () => {
    const { db, client } = makeDbMock();
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: "item-1", tenant_id: "tenant-1", type: "religion", name: "Custom", is_system: false }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "item-1", tenant_id: "tenant-1", type: "religion", name: "Custom", is_system: false, deleted_at: new Date() }],
      });
    const audit = makeAuditMock();
    const service = new MasterDataService(db, audit, makeScopedAccessMock(true));

    await expect(service.deleteItem("tenant-1", "actor-1", "item-1")).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
