import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DbService } from "../db/db.service.js";
import { ScopedAccessService } from "./scoped-access.service.js";

// DbService.withTransaction hands the callback a client-shaped object;
// every method here ultimately calls client.query (or DbService's own
// query/queryOne, which are themselves built on withTransaction) -- mock
// at that level, asserting on the SQL text/params passed.
interface FakeClient {
  query: ReturnType<typeof vi.fn>;
}

function makeDbMock() {
  const client: FakeClient = { query: vi.fn() };
  const db = {
    withTransaction: vi.fn(async (_tenantId: string, fn: (client: FakeClient) => unknown) => fn(client)),
    query: vi.fn(),
    queryOne: vi.fn(),
  } as unknown as DbService;
  return { db, client };
}

describe("ScopedAccessService", () => {
  let db: DbService;
  let client: { query: ReturnType<typeof vi.fn> };
  let service: ScopedAccessService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new ScopedAccessService(db);
  });

  describe("hasPermission", () => {
    it("returns false for a user with no roles", async () => {
      client.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.hasPermission("tenant-1", "user-1", "users.manage")).resolves.toBe(false);
      expect(client.query).toHaveBeenCalledTimes(1);
    });

    it("returns false when no role grants the permission", async () => {
      client.query.mockResolvedValueOnce({ rows: [{ role_id: "role-teacher" }] });
      client.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.hasPermission("tenant-1", "user-1", "users.manage")).resolves.toBe(false);
    });

    it("returns true when a role grants the permission", async () => {
      client.query.mockResolvedValueOnce({ rows: [{ role_id: "role-admin" }] });
      client.query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
      await expect(service.hasPermission("tenant-1", "user-1", "users.manage")).resolves.toBe(true);
    });

    it("queries fresh from the database rather than trusting a stale JWT roles claim", async () => {
      client.query.mockResolvedValueOnce({ rows: [{ role_id: "role-admin" }] });
      client.query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

      await service.hasPermission("tenant-1", "user-1", "users.manage");

      expect(client.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("FROM user_roles"),
        ["tenant-1", "user-1"],
      );
    });
  });

  describe("getActingStaff", () => {
    it("looks up the staff row linked to the given user within the tenant", async () => {
      (db.queryOne as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
      const result = await service.getActingStaff("tenant-1", "user-1");
      expect(result).toEqual({ id: "staff-1" });
      expect(db.queryOne).toHaveBeenCalledWith(
        "tenant-1",
        expect.stringContaining("FROM staff"),
        ["tenant-1", "user-1"],
      );
    });
  });

  describe("isClassTeacherOfSection", () => {
    it("returns true when the staff member is the section's class teacher", async () => {
      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ "?column?": 1 }]);
      await expect(service.isClassTeacherOfSection("tenant-1", "staff-1", "section-1")).resolves.toBe(true);
    });

    it("returns false when they are not", async () => {
      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      await expect(service.isClassTeacherOfSection("tenant-1", "staff-1", "section-1")).resolves.toBe(false);
    });
  });

  describe("isAssignedToSubject", () => {
    it("returns true when a matching assignment exists", async () => {
      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ "?column?": 1 }]);
      const result = await service.isAssignedToSubject(
        "tenant-1",
        "staff-1",
        "class-1",
        "subject-1",
        "session-1",
        "section-1",
      );
      expect(result).toBe(true);
      expect(db.query).toHaveBeenCalledWith(
        "tenant-1",
        expect.stringContaining("FROM teacher_subject_assignments"),
        ["tenant-1", "staff-1", "class-1", "subject-1", "session-1", "section-1"],
      );
    });

    it("matches a section-agnostic ('any section') assignment when sectionId is null", async () => {
      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      await service.isAssignedToSubject("tenant-1", "staff-1", "class-1", "subject-1", "session-1", null);
      expect(db.query).toHaveBeenCalledWith(
        "tenant-1",
        expect.stringContaining("section_id IS NULL"),
        ["tenant-1", "staff-1", "class-1", "subject-1", "session-1", null],
      );
    });
  });
});
