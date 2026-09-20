import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { AcademicService } from "./academic.service.js";

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

// Phase 2: classes is branch_id-bearing, so a branch-scoped caller touching
// a class outside their own branch by id must get NotFoundException exactly
// like a wrong id would (real Postgres excludes the row via the extra
// `branch_id = $N` predicate updateRow adds when branchId is passed --
// simulated here by mocking the row back as not found).
describe("AcademicService.updateClass branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: AcademicService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new AcademicService(db, audit);
  });

  it("404s updating a class outside the caller's branch", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.updateClass("tenant-1", "actor-1", "class-1", { name: "Grade 1", sort_order: 1 }, "branch-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("updates a class within the caller's own branch", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "class-1", tenant_id: "tenant-1", branch_id: "branch-a", name: "Grade 1", sort_order: 1 }],
    });

    await expect(
      service.updateClass("tenant-1", "actor-1", "class-1", { name: "Grade 1", sort_order: 1 }, "branch-a"),
    ).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("is unaffected for an unscoped (branchId: null) caller", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "class-1", tenant_id: "tenant-1", branch_id: "branch-other", name: "Grade 1", sort_order: 1 }],
    });

    await expect(
      service.updateClass("tenant-1", "actor-1", "class-1", { name: "Grade 1", sort_order: 1 }, null),
    ).resolves.toBeDefined();
  });
});

describe("AcademicService.deleteClass branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: AcademicService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new AcademicService(db, audit);
  });

  it("404s deleting a class outside the caller's branch", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.deleteClass("tenant-1", "actor-1", "class-1", "branch-a")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("deletes a class within the caller's own branch", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "class-1", tenant_id: "tenant-1", branch_id: "branch-a" }],
    });

    await expect(service.deleteClass("tenant-1", "actor-1", "class-1", "branch-a")).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("is unaffected for an unscoped (branchId: null) caller", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "class-1", tenant_id: "tenant-1", branch_id: "branch-other" }],
    });

    await expect(service.deleteClass("tenant-1", "actor-1", "class-1", null)).resolves.toBeDefined();
  });
});

// `branches` rows have no branch_id column of their own -- a row IS a
// branch -- so unlike every other Phase 2 case, this isn't threaded into
// updateRow: a branch-scoped caller's id must equal their own branch_id, or
// updateBranch rejects before ever touching the DB.
describe("AcademicService.updateBranch branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: AcademicService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new AcademicService(db, audit);
  });

  it("404s a branch-scoped caller updating a different branch's own record", async () => {
    await expect(
      service.updateBranch("tenant-1", "actor-1", "branch-other", { name: "Renamed" }, "branch-mine"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("lets a branch-scoped caller update their own branch", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "branch-mine", tenant_id: "tenant-1", name: "Old Name", print_template: "classic", print_paper_color: "white" }],
    });
    client.query.mockResolvedValueOnce({
      rows: [{ id: "branch-mine", tenant_id: "tenant-1", name: "Renamed" }],
    });

    await expect(
      service.updateBranch("tenant-1", "actor-1", "branch-mine", { name: "Renamed" }, "branch-mine"),
    ).resolves.toBeDefined();
  });

  it("is unaffected for an unscoped (branchId: null) caller", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "branch-any", tenant_id: "tenant-1", name: "Old Name", print_template: "classic", print_paper_color: "white" }],
    });
    client.query.mockResolvedValueOnce({
      rows: [{ id: "branch-any", tenant_id: "tenant-1", name: "Renamed" }],
    });

    await expect(
      service.updateBranch("tenant-1", "actor-1", "branch-any", { name: "Renamed" }, null),
    ).resolves.toBeDefined();
  });
});
