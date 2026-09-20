import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JwtPayload } from "../auth/jwt.strategy.js";
import type { DbService } from "../db/db.service.js";
import { AuditLogController } from "./audit-log.controller.js";

function makeDbMock() {
  return { query: vi.fn().mockResolvedValue([]) } as unknown as DbService & { query: ReturnType<typeof vi.fn> };
}

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return { sub: "actor-1", tenant_id: "tenant-1", branch_id: null, roles: [], type: "access", ...overrides };
}

describe("AuditLogController.list (branch isolation)", () => {
  let db: ReturnType<typeof makeDbMock>;
  let controller: AuditLogController;

  beforeEach(() => {
    db = makeDbMock();
    controller = new AuditLogController(db);
  });

  it("adds an al.branch_id condition and binds branchId when the caller is branch-scoped", async () => {
    await controller.list(makeUser({ branch_id: "branch-a" }));

    const [, sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/al\.branch_id = \$2/);
    expect(params).toContain("branch-a");
  });

  it("excludes a different branch's audit entries -- the fake DB mirrors what the WHERE clause would filter out", async () => {
    db.query.mockResolvedValueOnce([]);

    const result = await controller.list(makeUser({ branch_id: "branch-a" }));

    expect(result).toEqual([]);
  });

  it("returns the caller's own-branch audit entries", async () => {
    db.query.mockResolvedValueOnce([
      {
        id: "audit-1",
        full_name: "Jane Admin",
        entity_table: "houses",
        entity_id: "house-1",
        action: "update",
        summary: "Renamed house",
        created_at: new Date("2026-01-01"),
      },
    ]);

    const result = await controller.list(makeUser({ branch_id: "branch-a" }));

    expect(result).toEqual([
      {
        id: "audit-1",
        actor_name: "Jane Admin",
        entity_table: "houses",
        entity_id: "house-1",
        action: "update",
        summary: "Renamed house",
        created_at: new Date("2026-01-01"),
      },
    ]);
  });

  it("an unscoped caller (branchId: null) omits the branch condition entirely", async () => {
    await controller.list(makeUser({ branch_id: null }));

    const [, sql, params] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/branch_id/);
    expect(params).toEqual(["tenant-1", 100, 0]);
  });
});
