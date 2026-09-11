import { ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../prisma/prisma.service.js";
import { SyncService } from "./sync.service.js";

function makePrismaMock() {
  return {
    syncLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  } as unknown as PrismaService;
}

describe("SyncService", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: SyncService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new SyncService(prisma);
  });

  it("rejects pushing changes for a tenant other than the caller's", async () => {
    await expect(
      service.push("tenant-a", "tenant-b", []),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects pulling changes for a tenant other than the caller's", async () => {
    await expect(
      service.pull("tenant-a", "tenant-b", 0),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("logs each pushed change and returns its assigned server_seq", async () => {
    (prisma.syncLog.create as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ serverSeq: 1n })
      .mockResolvedValueOnce({ serverSeq: 2n });

    const results = await service.push("tenant-a", "tenant-a", [
      {
        entity_table: "students",
        entity_id: "s1",
        op: "insert",
        payload: { id: "s1" },
        client_ts: "2026-01-01T00:00:00Z",
      },
      {
        entity_table: "guardians",
        entity_id: "g1",
        op: "insert",
        payload: { id: "g1" },
        client_ts: "2026-01-01T00:00:00Z",
      },
    ]);

    expect(results).toEqual([
      { entity_table: "students", entity_id: "s1", server_seq: 1, accepted: true },
      { entity_table: "guardians", entity_id: "g1", server_seq: 2, accepted: true },
    ]);
    expect(prisma.syncLog.create).toHaveBeenCalledTimes(2);
  });

  it("returns has_more=true when a pull page is exactly full", async () => {
    (prisma.syncLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        serverSeq: 5n,
        tenantId: "tenant-a",
        entityTable: "students",
        entityId: "s1",
        op: "insert",
        payload: { id: "s1" },
      },
    ]);

    const result = await service.pull("tenant-a", "tenant-a", 4, 1);

    expect(result.has_more).toBe(true);
    expect(result.latest_server_seq).toBe(5);
    expect(result.changes).toHaveLength(1);
  });

  it("returns has_more=false and keeps the caller's cursor when there is nothing new", async () => {
    (prisma.syncLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await service.pull("tenant-a", "tenant-a", 10);

    expect(result.has_more).toBe(false);
    expect(result.latest_server_seq).toBe(10);
    expect(result.changes).toEqual([]);
  });
});
