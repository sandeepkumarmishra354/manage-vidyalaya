import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { StaffCategoriesService } from "./staff-categories.service.js";

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

describe("StaffCategoriesService.deleteCategory", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: ReturnType<typeof makeDbMock>["client"];
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StaffCategoriesService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new StaffCategoriesService(db, audit);
  });

  it("throws NotFoundException when the category doesn't exist", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.deleteCategory("tenant-1", "actor-1", "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects deleting a default (system-seeded) category", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "cat-1", tenant_id: "tenant-1", name: "Teacher", is_system: true }],
    });

    await expect(service.deleteCategory("tenant-1", "actor-1", "cat-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects deleting a category still assigned to staff", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "cat-1", tenant_id: "tenant-1", name: "Custom", is_system: false }] })
      .mockResolvedValueOnce({ rows: [{ count: "2" }] });

    await expect(service.deleteCategory("tenant-1", "actor-1", "cat-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("deletes a custom, unassigned category", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "cat-1", tenant_id: "tenant-1", name: "Custom", is_system: false }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({
        rows: [{ id: "cat-1", tenant_id: "tenant-1", name: "Custom", is_system: false, deleted_at: new Date() }],
      });

    await expect(service.deleteCategory("tenant-1", "actor-1", "cat-1")).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
