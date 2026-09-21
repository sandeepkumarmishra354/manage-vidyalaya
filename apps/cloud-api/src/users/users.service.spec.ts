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

function makePlanLimitsMock() {
  return { assertUnderLimit: vi.fn().mockResolvedValue(undefined) };
}

describe("UsersService", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let planLimits: ReturnType<typeof makePlanLimitsMock>;
  let service: UsersService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    planLimits = makePlanLimitsMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new UsersService(db, audit, planLimits as any);
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
        client.query
          .mockResolvedValueOnce({ rowCount: 0 }) // target does not hold roles.manage -- not protected
          .mockResolvedValueOnce({ rows: [] }); // updateRow, branch-filtered -- no match

        await expect(
          service.setUserActive("tenant-a", "actor-1", "user-1", false, "branch-other"),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it("succeeds and threads branchId into the UPDATE for the caller's own-branch user", async () => {
        client.query
          .mockResolvedValueOnce({ rowCount: 0 }) // target not protected
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a", is_active: false }] });

        await service.setUserActive("tenant-a", "actor-1", "user-1", false, "branch-a");

        const [sql, params] = client.query.mock.calls[1];
        expect(sql).toMatch(/branch_id = \$\d/);
        expect(params).toContain("branch-a");
      });

      it("an unscoped caller (branchId: null) is unaffected", async () => {
        client.query
          .mockResolvedValueOnce({ rowCount: 0 }) // target not protected
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] });

        await service.setUserActive("tenant-a", "actor-1", "user-1", true, null);

        const [sql] = client.query.mock.calls[1];
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
          .mockResolvedValueOnce({ rowCount: 0 }) // target not protected
          .mockResolvedValueOnce({ rowCount: 0 }) // role being granted doesn't carry roles.manage
          .mockResolvedValueOnce({ rows: [{ name: "accountant" }] }) // getRoleName -- not headcount-limited
          .mockResolvedValueOnce({ rows: [] }); // INSERT INTO user_roles

        await service.assignUserRole("tenant-a", "actor-1", "user-1", "role-1", "branch-a");

        expect(client.query).toHaveBeenCalledTimes(5);
      });

      it("an unscoped caller (branchId: null) is unaffected", async () => {
        client.query
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] })
          .mockResolvedValueOnce({ rowCount: 0 })
          .mockResolvedValueOnce({ rowCount: 0 })
          .mockResolvedValueOnce({ rows: [{ name: "accountant" }] }) // getRoleName -- not headcount-limited
          .mockResolvedValueOnce({ rows: [] });

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
          .mockResolvedValueOnce({ rowCount: 0 }) // target not protected
          .mockResolvedValueOnce({ rows: [] }); // DELETE FROM user_roles

        await service.removeUserRole("tenant-a", "actor-1", "user-1", "role-1", "branch-a");

        expect(client.query).toHaveBeenCalledTimes(3);
      });
    });
  });

  // A branch_admin holds every permission except roles.manage (the one
  // permission uniquely granted to super_admin -- see permission-catalog.ts),
  // so these guards can't be expressed as a flat @RequirePermission check;
  // they compare the actor's and target's actual role grants at call time.
  describe("privilege escalation guards", () => {
    describe("assignUserRole", () => {
      it("rejects a user assigning a role to themselves", async () => {
        await expect(
          service.assignUserRole("tenant-a", "actor-1", "actor-1", "role-1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(client.query).not.toHaveBeenCalled();
      });

      it("rejects a non-super-admin actor changing the roles of a super-admin-tier target", async () => {
        client.query
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] }) // findOneForTenant
          .mockResolvedValueOnce({ rowCount: 1 }) // target holds roles.manage
          .mockResolvedValueOnce({ rowCount: 0 }); // actor does not

        await expect(
          service.assignUserRole("tenant-a", "branch-admin-1", "user-1", "role-1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it("rejects a non-super-admin actor granting a role that itself carries roles.manage", async () => {
        client.query
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] }) // findOneForTenant
          .mockResolvedValueOnce({ rowCount: 0 }) // target not (yet) protected
          .mockResolvedValueOnce({ rowCount: 1 }) // the role being granted carries roles.manage
          .mockResolvedValueOnce({ rowCount: 0 }); // actor doesn't hold roles.manage

        await expect(
          service.assignUserRole("tenant-a", "branch-admin-1", "user-1", "super-admin-role"),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it("allows a super-admin actor to grant a role that carries roles.manage", async () => {
        client.query
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] }) // findOneForTenant
          .mockResolvedValueOnce({ rowCount: 0 }) // target not yet protected
          .mockResolvedValueOnce({ rowCount: 1 }) // role carries roles.manage
          .mockResolvedValueOnce({ rowCount: 1 }) // actor holds roles.manage
          .mockResolvedValueOnce({ rows: [{ name: "super_admin" }] }) // getRoleName
          .mockResolvedValueOnce({ rows: [] }) // alreadyAssigned check -- not yet assigned
          .mockResolvedValueOnce({ rows: [{ count: "1" }] }) // current super_admin headcount
          .mockResolvedValueOnce({ rows: [] }); // INSERT

        await service.assignUserRole("tenant-a", "super-admin-1", "user-1", "super-admin-role");

        expect(client.query).toHaveBeenCalledTimes(8);
        expect(planLimits.assertUnderLimit).toHaveBeenCalledWith("tenant-a", "max_super_admins", 1, expect.any(String));
      });
    });

    describe("role headcount limits", () => {
      it("skips the headcount check entirely for a role that isn't super_admin/branch_admin", async () => {
        client.query
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] }) // findOneForTenant
          .mockResolvedValueOnce({ rowCount: 0 }) // target not protected
          .mockResolvedValueOnce({ rowCount: 0 }) // role doesn't carry roles.manage
          .mockResolvedValueOnce({ rows: [{ name: "teacher" }] }) // getRoleName
          .mockResolvedValueOnce({ rows: [] }); // INSERT

        await service.assignUserRole("tenant-a", "actor-1", "user-1", "teacher-role");

        expect(client.query).toHaveBeenCalledTimes(5);
        expect(planLimits.assertUnderLimit).not.toHaveBeenCalled();
      });

      it("skips the headcount check when the user already holds the role (idempotent re-assignment)", async () => {
        client.query
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] }) // findOneForTenant
          .mockResolvedValueOnce({ rowCount: 0 }) // target not protected
          .mockResolvedValueOnce({ rowCount: 1 }) // role carries roles.manage
          .mockResolvedValueOnce({ rowCount: 1 }) // actor holds roles.manage
          .mockResolvedValueOnce({ rows: [{ name: "super_admin" }] }) // getRoleName
          .mockResolvedValueOnce({ rowCount: 1, rows: [{ x: 1 }] }) // alreadyAssigned -- already holds it
          .mockResolvedValueOnce({ rows: [] }); // INSERT (ON CONFLICT DO NOTHING)

        await service.assignUserRole("tenant-a", "super-admin-1", "user-1", "super-admin-role");

        expect(planLimits.assertUnderLimit).not.toHaveBeenCalled();
      });

      it("rejects assigning a headcount-limited role once the plan's limit is reached", async () => {
        client.query
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] }) // findOneForTenant
          .mockResolvedValueOnce({ rowCount: 0 }) // target not protected
          .mockResolvedValueOnce({ rowCount: 1 }) // role carries roles.manage
          .mockResolvedValueOnce({ rowCount: 1 }) // actor holds roles.manage
          .mockResolvedValueOnce({ rows: [{ name: "super_admin" }] }) // getRoleName
          .mockResolvedValueOnce({ rows: [] }) // not yet assigned
          .mockResolvedValueOnce({ rows: [{ count: "2" }] }); // already at the plan's limit
        planLimits.assertUnderLimit.mockRejectedValueOnce(new ForbiddenException("plan limit reached"));

        await expect(
          service.assignUserRole("tenant-a", "super-admin-1", "user-1", "super-admin-role"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        // never reaches the INSERT
        expect(client.query).toHaveBeenCalledTimes(7);
      });
    });

    describe("removeUserRole", () => {
      it("rejects a user removing their own role", async () => {
        await expect(
          service.removeUserRole("tenant-a", "actor-1", "actor-1", "role-1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(client.query).not.toHaveBeenCalled();
      });

      it("rejects a non-super-admin actor changing the roles of a super-admin-tier target", async () => {
        client.query
          .mockResolvedValueOnce({ rows: [{ id: "user-1", tenant_id: "tenant-a" }] }) // findOneForTenant
          .mockResolvedValueOnce({ rowCount: 1 }) // target holds roles.manage
          .mockResolvedValueOnce({ rowCount: 0 }); // actor does not

        await expect(
          service.removeUserRole("tenant-a", "branch-admin-1", "user-1", "role-1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    describe("setUserActive", () => {
      it("rejects a non-super-admin actor deactivating a super-admin-tier target", async () => {
        client.query
          .mockResolvedValueOnce({ rowCount: 1 }) // target holds roles.manage
          .mockResolvedValueOnce({ rowCount: 0 }); // actor does not

        await expect(
          service.setUserActive("tenant-a", "branch-admin-1", "user-1", false),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it("allows a super-admin actor to deactivate another super-admin-tier account", async () => {
        client.query
          .mockResolvedValueOnce({ rowCount: 1 }) // target holds roles.manage
          .mockResolvedValueOnce({ rowCount: 1 }) // actor holds it too
          .mockResolvedValueOnce({
            rows: [{ id: "user-1", tenant_id: "tenant-a", full_name: "Super Two", email: "s2@example.com", is_active: false, password_hash: "$2b$10$leaked" }],
          });

        const result = await service.setUserActive("tenant-a", "super-admin-1", "user-1", false);

        expect(result).toEqual({ id: "user-1", full_name: "Super Two", email: "s2@example.com", is_active: false });
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

  describe("setUserActive response shape", () => {
    it("never returns password_hash, even though the underlying UPDATE returns the full row", async () => {
      client.query
        .mockResolvedValueOnce({ rowCount: 0 }) // target not protected
        .mockResolvedValueOnce({
          rows: [
            {
              id: "user-1",
              tenant_id: "tenant-a",
              full_name: "Jane Teacher",
              email: "jane@example.com",
              is_active: false,
              password_hash: "$2b$10$shouldneverleave",
            },
          ],
        });

      const result = await service.setUserActive("tenant-a", "actor-1", "user-1", false);

      expect(result).not.toHaveProperty("password_hash");
      expect(result).toEqual({ id: "user-1", full_name: "Jane Teacher", email: "jane@example.com", is_active: false });
    });
  });
});
