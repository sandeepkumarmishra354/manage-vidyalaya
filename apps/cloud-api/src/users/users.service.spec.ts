import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { UsersService } from "./users.service.js";

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
}

function makeDbMock() {
  const client: FakeClient = { query: vi.fn() };
  const db = {
    withTransaction: vi.fn(async (_tenantId: string, fn: (client: FakeClient) => unknown) => fn(client)),
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn(),
  } as unknown as DbService & { query: ReturnType<typeof vi.fn>; queryOne: ReturnType<typeof vi.fn> };
  return { db, client };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("UsersService", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: UsersService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new UsersService(db, audit);
  });

  describe("createUser", () => {
    it("rejects creating a user for another tenant", async () => {
      await expect(
        service.createUser("tenant-a", {
          tenant_id: "tenant-b",
          full_name: "Someone",
          email: "someone@example.com",
          password: "password123",
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("hashes the password rather than storing it in plaintext", async () => {
      client.query.mockResolvedValueOnce({ rows: [{ id: "user-1" }] });

      await service.createUser("tenant-a", {
        tenant_id: "tenant-a",
        full_name: "Jane Teacher",
        email: "jane@example.com",
        password: "correct-horse-battery-staple",
      });

      const [, params] = client.query.mock.calls[0];
      const passwordHash = (params as unknown[]).find((p) => typeof p === "string" && p.startsWith("$2"));
      expect(passwordHash).toBeDefined();
      expect(passwordHash).not.toBe("correct-horse-battery-staple");
    });

    it("returns the new user's id", async () => {
      client.query.mockResolvedValueOnce({ rows: [{ id: "user-42" }] });

      const result = await service.createUser("tenant-a", {
        tenant_id: "tenant-a",
        full_name: "Jane Teacher",
        email: "jane@example.com",
        password: "correct-horse-battery-staple",
      });

      expect(result).toEqual({ id: "user-42" });
    });
  });

  describe("resetPassword", () => {
    it("throws NotFoundException for a user that doesn't exist", async () => {
      client.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.resetPassword("tenant-a", "actor-1", "missing-user", "new-password"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("hashes the new password before storing it", async () => {
      client.query
        .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] }) // findOneForTenant
        .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] }); // updateRow

      await service.resetPassword("tenant-a", "actor-1", "user-1", "brand-new-password");

      const [updateSql, updateParams] = client.query.mock.calls[1];
      expect(updateSql).toContain("UPDATE users");
      const passwordHash = updateParams[0];
      expect(passwordHash).not.toBe("brand-new-password");
      expect(String(passwordHash).length).toBeGreaterThan(20);
    });
  });

  describe("createStaffLogin", () => {
    it("404s when the target staff member doesn't exist", async () => {
      client.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.createStaffLogin("tenant-a", "actor-1", {
          staff_id: "missing",
          email: "new@example.com",
          full_name: "New Teacher",
          initial_password: "correct-horse-battery-staple",
          branch_id: "branch-1",
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects creating a login for a relieved staff member", async () => {
      client.query.mockResolvedValueOnce({ rows: [{ id: "staff-1", status: "relieved" }] });

      await expect(
        service.createStaffLogin("tenant-a", "actor-1", {
          staff_id: "staff-1",
          email: "ex@example.com",
          full_name: "Ex Teacher",
          initial_password: "correct-horse-battery-staple",
          branch_id: "branch-1",
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("creates a login for an active staff member", async () => {
      client.query
        .mockResolvedValueOnce({ rows: [{ id: "staff-1", status: "active" }] }) // findOneForTenant staff
        .mockResolvedValueOnce({ rows: [{ id: "user-1" }] }) // insertRow users
        .mockResolvedValueOnce({ rows: [{ id: "staff-1", user_id: "user-1" }] }); // updateRow staff

      const result = await service.createStaffLogin("tenant-a", "actor-1", {
        staff_id: "staff-1",
        email: "teacher@example.com",
        full_name: "Teacher",
        initial_password: "correct-horse-battery-staple",
        branch_id: "branch-1",
      });

      expect(result).toEqual({ id: "user-1" });
      const [updateSql, updateParams] = client.query.mock.calls[2];
      expect(updateSql).toContain("UPDATE staff");
      expect(updateParams).toContain("user-1");
    });
  });

  describe("branch isolation", () => {
    describe("resetPassword", () => {
      it("throws NotFoundException resetting a password for a same-tenant, different-branch user", async () => {
        client.query.mockResolvedValueOnce({ rows: [] }); // findOneForTenant, branch-filtered -- no match

        await expect(
          service.resetPassword("tenant-a", "actor-1", "user-1", "new-password", "branch-other"),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it("succeeds and threads branchId into the UPDATE for the caller's own-branch user", async () => {
        client.query
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a", branch_id: "branch-a" }] })
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] });

        await service.resetPassword("tenant-a", "actor-1", "user-1", "new-password", "branch-a");

        const [updateSql, updateParams] = client.query.mock.calls[1];
        expect(updateSql).toMatch(/branch_id = \$\d/);
        expect(updateParams).toContain("branch-a");
      });

      it("an unscoped caller (branchId: null) is unaffected", async () => {
        client.query
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] })
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] });

        await service.resetPassword("tenant-a", "actor-1", "user-1", "new-password", null);

        const [findSql] = client.query.mock.calls[0];
        const [updateSql] = client.query.mock.calls[1];
        expect(findSql).not.toMatch(/branch_id/);
        expect(updateSql).not.toMatch(/branch_id/);
      });
    });

    describe("setUserActive", () => {
      it("throws NotFoundException deactivating a same-tenant, different-branch user", async () => {
        client.query.mockResolvedValueOnce({ rows: [] });

        await expect(
          service.setUserActive("tenant-a", "actor-1", "user-1", false, "branch-other"),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it("succeeds and threads branchId into the UPDATE for the caller's own-branch user", async () => {
        client.query.mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a", is_active: false }] });

        await service.setUserActive("tenant-a", "actor-1", "user-1", false, "branch-a");

        const [sql, params] = client.query.mock.calls[0];
        expect(sql).toMatch(/branch_id = \$\d/);
        expect(params).toContain("branch-a");
      });

      it("an unscoped caller (branchId: null) is unaffected", async () => {
        client.query.mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] });

        await service.setUserActive("tenant-a", "actor-1", "user-1", true, null);

        const [sql] = client.query.mock.calls[0];
        expect(sql).not.toMatch(/branch_id/);
      });
    });

    describe("assignUserRole", () => {
      it("throws NotFoundException assigning a role to a same-tenant, different-branch user", async () => {
        client.query.mockResolvedValueOnce({ rows: [] }); // ownership check fails

        await expect(
          service.assignUserRole("tenant-a", "actor-1", "user-1", "role-1", "branch-other"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(client.query).toHaveBeenCalledTimes(1); // never reaches the INSERT
      });

      it("succeeds for the caller's own-branch user", async () => {
        client.query
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a", branch_id: "branch-a" }] })
          .mockResolvedValueOnce({ rows: [] }); // INSERT INTO user_roles

        await service.assignUserRole("tenant-a", "actor-1", "user-1", "role-1", "branch-a");

        expect(client.query).toHaveBeenCalledTimes(2);
      });

      it("an unscoped caller (branchId: null) is unaffected", async () => {
        client.query.mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] }).mockResolvedValueOnce({ rows: [] });

        await service.assignUserRole("tenant-a", "actor-1", "user-1", "role-1", null);

        const [findSql] = client.query.mock.calls[0];
        expect(findSql).not.toMatch(/branch_id/);
      });
    });

    describe("removeUserRole", () => {
      it("throws NotFoundException removing a role from a same-tenant, different-branch user", async () => {
        client.query.mockResolvedValueOnce({ rows: [] });

        await expect(
          service.removeUserRole("tenant-a", "actor-1", "user-1", "role-1", "branch-other"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(client.query).toHaveBeenCalledTimes(1); // never reaches the DELETE
      });

      it("succeeds for the caller's own-branch user", async () => {
        client.query
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a", branch_id: "branch-a" }] })
          .mockResolvedValueOnce({ rows: [] }); // DELETE FROM user_roles

        await service.removeUserRole("tenant-a", "actor-1", "user-1", "role-1", "branch-a");

        expect(client.query).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("listUsers", () => {
    it("scopes to the tenant with no extra filters when none are given", async () => {
      await service.listUsers("tenant-a");
      expect(db.query).toHaveBeenCalledWith(
        "tenant-a",
        expect.stringContaining("u.tenant_id = $1"),
        ["tenant-a"],
      );
    });

    it("combines search and role filters with AND", async () => {
      await service.listUsers("tenant-a", "jane", "role-1");
      const [, sql, params] = (db.query as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain("u.tenant_id = $1");
      expect(sql).toContain("EXISTS");
      expect(sql).toContain("ILIKE");
      expect(params).toEqual(["tenant-a", "role-1", "%jane%"]);
    });
  });
});
