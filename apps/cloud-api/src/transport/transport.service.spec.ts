import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { TransportService } from "./transport.service.js";

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

describe("TransportService.assignStudentTransport", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: TransportService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new TransportService(db, audit);
  });

  it("resets deleted_at on the upsert, so re-assigning after a soft-delete becomes visible again", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "assignment-1", tenant_id: "tenant-1", student_id: "student-1", route_id: "route-1", stop_id: "stop-1" }],
    });

    await service.assignStudentTransport("tenant-1", "actor-1", {
      student_id: "student-1",
      route_id: "route-1",
      stop_id: "stop-1",
    });

    const [text, params] = client.query.mock.calls[0];
    expect(text).toMatch(/ON CONFLICT \(student_id\) DO UPDATE/);
    expect(text).toMatch(/deleted_at = NULL/);
    expect(params).toContain("route-1");
    expect(params).toContain("stop-1");
  });

  it("records an audit entry for the assignment", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "assignment-1", tenant_id: "tenant-1", student_id: "student-1", route_id: "route-1", stop_id: "stop-1" }],
    });

    await service.assignStudentTransport("tenant-1", "actor-1", {
      student_id: "student-1",
      route_id: "route-1",
      stop_id: "stop-1",
    });

    expect(audit.record).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        tenantId: "tenant-1",
        actorUserId: "actor-1",
        entityTable: "student_transport",
        entityId: "assignment-1",
        action: "update",
      }),
    );
  });
});

describe("TransportService.updateRoute (branch isolation)", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: TransportService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new TransportService(db, audit);
  });

  it("throws NotFoundException for a same-tenant, different-branch route", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.updateRoute("tenant-1", "actor-1", "route-1", { name: "Route A" }, "branch-other"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("succeeds and threads branchId into the UPDATE for the caller's own-branch route", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: "route-1", tenant_id: "tenant-1", branch_id: "branch-a" }] });

    await service.updateRoute("tenant-1", "actor-1", "route-1", { name: "Route A" }, "branch-a");

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/branch_id = \$\d/);
    expect(params).toContain("branch-a");
  });

  it("an unscoped caller (branchId: null) is unaffected", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: "route-1", tenant_id: "tenant-1" }] });

    await service.updateRoute("tenant-1", "actor-1", "route-1", { name: "Route A" }, null);

    const [sql] = client.query.mock.calls[0];
    expect(sql).not.toMatch(/branch_id/);
  });
});

describe("TransportService.updateStop (branch isolation via parent route)", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: TransportService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new TransportService(db, audit);
  });

  it("throws NotFoundException updating a stop whose route belongs to a different branch", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "stop-1", tenant_id: "tenant-1", route_id: "route-1" }] }) // stop lookup (unscoped)
      .mockResolvedValueOnce({ rows: [] }); // route lookup, branch-scoped -- no match

    await expect(
      service.updateStop("tenant-1", "actor-1", "stop-1", { name: "Gate 2" }, "branch-other"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException when the stop itself doesn't exist for this tenant", async () => {
    client.query.mockResolvedValueOnce({ rows: [] }); // stop lookup fails

    await expect(
      service.updateStop("tenant-1", "actor-1", "stop-1", { name: "Gate 2" }, "branch-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("succeeds when the stop's route belongs to the caller's own branch", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "stop-1", tenant_id: "tenant-1", route_id: "route-1" }] }) // stop lookup
      .mockResolvedValueOnce({ rows: [{ id: "route-1", tenant_id: "tenant-1", branch_id: "branch-a" }] }) // route lookup, matches
      .mockResolvedValueOnce({ rows: [{ id: "stop-1", tenant_id: "tenant-1", name: "Gate 2" }] }); // updateRow

    const result = await service.updateStop("tenant-1", "actor-1", "stop-1", { name: "Gate 2" }, "branch-a");

    expect(result).toMatchObject({ id: "stop-1", name: "Gate 2" });
    expect(client.query).toHaveBeenCalledTimes(3); // stop lookup, route lookup, update (audit is mocked, not real SQL)
  });

  it("an unscoped caller (branchId: null) skips the route-ownership check entirely", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: "stop-1", tenant_id: "tenant-1", name: "Gate 2" }] }); // updateRow only

    await service.updateStop("tenant-1", "actor-1", "stop-1", { name: "Gate 2" }, null);

    expect(client.query).toHaveBeenCalledTimes(1); // update only, no ownership lookups
  });
});

describe("TransportService.listStops / listRouteRoster (branch isolation)", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let service: TransportService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    service = new TransportService(db, makeAuditMock());
  });

  it("listStops returns an empty list for a route that belongs to a different branch", async () => {
    db.queryOne.mockResolvedValueOnce(null); // route ownership check fails

    const result = await service.listStops("tenant-1", "route-1", "branch-other");

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("listStops returns stops for the caller's own-branch route", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "route-1", tenant_id: "tenant-1", branch_id: "branch-a" });
    db.query.mockResolvedValueOnce([{ id: "stop-1" }]);

    const result = await service.listStops("tenant-1", "route-1", "branch-a");

    expect(result).toEqual([{ id: "stop-1" }]);
  });

  it("listStops skips the ownership check for an unscoped caller (branchId: null)", async () => {
    db.query.mockResolvedValueOnce([{ id: "stop-1" }]);

    await service.listStops("tenant-1", "route-1", null);

    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it("listRouteRoster returns an empty roster for a route that belongs to a different branch", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    const result = await service.listRouteRoster("tenant-1", "route-1", "branch-other");

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("listRouteRoster returns the roster for the caller's own-branch route", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "route-1", tenant_id: "tenant-1", branch_id: "branch-a" });
    db.query.mockResolvedValueOnce([
      { student_id: "student-1", first_name: "Asha", last_name: null, stop_name: "Gate 2" },
    ]);

    const result = await service.listRouteRoster("tenant-1", "route-1", "branch-a");

    expect(result).toEqual([{ student_id: "student-1", first_name: "Asha", last_name: null, stop_name: "Gate 2" }]);
  });
});

describe("TransportService.getStudentTransport (branch isolation)", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let service: TransportService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    service = new TransportService(db, makeAuditMock());
  });

  it("adds an r.branch_id condition and binds branchId when the caller is branch-scoped", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    await service.getStudentTransport("tenant-1", "student-1", "branch-a");

    const [, sql, params] = db.queryOne.mock.calls[0];
    expect(sql).toMatch(/r\.branch_id = \$3/);
    expect(params).toEqual(["tenant-1", "student-1", "branch-a"]);
  });

  it("returns null when the student's route belongs to a different branch", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    const result = await service.getStudentTransport("tenant-1", "student-1", "branch-other");

    expect(result).toBeNull();
  });

  it("an unscoped caller (branchId: null) omits the branch condition", async () => {
    db.queryOne.mockResolvedValueOnce({ route_name: "Route A", stop_name: "Gate 2", pickup_time: null });

    await service.getStudentTransport("tenant-1", "student-1", null);

    const [, sql, params] = db.queryOne.mock.calls[0];
    expect(sql).not.toMatch(/branch_id/);
    expect(params).toEqual(["tenant-1", "student-1"]);
  });
});
