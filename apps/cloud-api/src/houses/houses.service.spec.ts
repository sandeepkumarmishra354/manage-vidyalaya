import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { HousesService } from "./houses.service.js";

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

describe("HousesService.updateHouse (branch isolation)", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let service: HousesService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new HousesService(db, makeAuditMock());
  });

  it("threads branchId into the UPDATE's WHERE clause when the caller is branch-scoped", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: "house-1", tenant_id: "tenant-1", branch_id: "branch-a" }] });

    await service.updateHouse("tenant-1", "actor-1", "house-1", { name: "Griffindor" }, "branch-a");

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/branch_id = \$\d/);
    expect(params).toContain("branch-a");
  });

  it("throws NotFoundException for a same-tenant, different-branch house (DB's branch-filtered WHERE finds no row)", async () => {
    // A branch-scoped caller's UPDATE ... WHERE branch_id = $N never matches
    // a house that lives in another branch -- simulate what Postgres would
    // actually return for that mismatch.
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.updateHouse("tenant-1", "actor-1", "house-1", { name: "Griffindor" }, "branch-other"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("succeeds for the caller's own-branch house", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "house-1", tenant_id: "tenant-1", branch_id: "branch-a", name: "Griffindor" }],
    });

    const result = await service.updateHouse("tenant-1", "actor-1", "house-1", { name: "Griffindor" }, "branch-a");

    expect(result).toMatchObject({ id: "house-1", name: "Griffindor" });
  });

  it("an unscoped caller (branchId: null) is unaffected -- no branch_id condition, update proceeds by id/tenant alone", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "house-1", tenant_id: "tenant-1", branch_id: "branch-a", name: "Griffindor" }],
    });

    await service.updateHouse("tenant-1", "actor-1", "house-1", { name: "Griffindor" }, null);

    const [sql] = client.query.mock.calls[0];
    expect(sql).not.toMatch(/branch_id/);
  });
});

describe("HousesService.getStudentHouse (branch isolation)", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let service: HousesService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    service = new HousesService(db, makeAuditMock());
  });

  it("adds an h.branch_id condition and binds branchId when the caller is branch-scoped", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    await service.getStudentHouse("tenant-1", "student-1", "branch-a");

    const [, sql, params] = db.queryOne.mock.calls[0];
    expect(sql).toMatch(/h\.branch_id = \$3/);
    expect(params).toEqual(["tenant-1", "student-1", "branch-a"]);
  });

  it("returns null (not the other branch's house) when the student's house belongs to a different branch", async () => {
    // The real WHERE h.branch_id = $3 clause would exclude the row; the
    // fake DB layer mirrors that by returning null for the mismatched case.
    db.queryOne.mockResolvedValueOnce(null);

    const result = await service.getStudentHouse("tenant-1", "student-1", "branch-other");

    expect(result).toBeNull();
  });

  it("returns the house when it belongs to the caller's own branch", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "house-1", tenant_id: "tenant-1", branch_id: "branch-a", name: "Griffindor" });

    const result = await service.getStudentHouse("tenant-1", "student-1", "branch-a");

    expect(result).toMatchObject({ id: "house-1", name: "Griffindor" });
  });

  it("an unscoped caller (branchId: null) omits the branch condition entirely", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "house-1", tenant_id: "tenant-1", branch_id: "branch-a" });

    await service.getStudentHouse("tenant-1", "student-1", null);

    const [, sql, params] = db.queryOne.mock.calls[0];
    expect(sql).not.toMatch(/branch_id/);
    expect(params).toEqual(["tenant-1", "student-1"]);
  });
});
