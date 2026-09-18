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
