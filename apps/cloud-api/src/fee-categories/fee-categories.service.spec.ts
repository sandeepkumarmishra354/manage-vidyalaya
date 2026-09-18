import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { FeeCategoriesService } from "./fee-categories.service.js";

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

describe("FeeCategoriesService.createCategory", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: FeeCategoriesService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new FeeCategoriesService(db, audit);
  });

  it("derives a slug key from the display name", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] }) // duplicate check
      .mockResolvedValueOnce({ rows: [{ id: "cat-1", tenant_id: "tenant-1" }] }); // insert

    await service.createCategory("tenant-1", "actor-1", { name: "Sports Fee" });

    const [, params] = client.query.mock.calls[0];
    expect(params).toContain("sports_fee");
  });

  it("rejects a name that produces an empty slug", async () => {
    await expect(service.createCategory("tenant-1", "actor-1", { name: "***" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejects a duplicate category (same slug already exists)", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: "existing", tenant_id: "tenant-1" }] });

    await expect(service.createCategory("tenant-1", "actor-1", { name: "Tuition" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("FeeCategoriesService.deleteCategory", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: FeeCategoriesService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new FeeCategoriesService(db, audit);
  });

  it("throws NotFoundException when the category doesn't exist", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.deleteCategory("tenant-1", "actor-1", "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects deleting a default (system-seeded) category", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "cat-1", tenant_id: "tenant-1", name: "Tuition", key: "tuition", is_system: true }],
    });

    await expect(service.deleteCategory("tenant-1", "actor-1", "cat-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects deleting a category still referenced by a fee structure", async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: "cat-1", tenant_id: "tenant-1", name: "Custom", key: "custom", is_system: false }],
      })
      .mockResolvedValueOnce({ rows: [{ count: "2" }] });

    await expect(service.deleteCategory("tenant-1", "actor-1", "cat-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("deletes a custom, unreferenced category", async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: "cat-1", tenant_id: "tenant-1", name: "Custom", key: "custom", is_system: false }],
      })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ id: "cat-1", tenant_id: "tenant-1" }] });

    await expect(service.deleteCategory("tenant-1", "actor-1", "cat-1")).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
