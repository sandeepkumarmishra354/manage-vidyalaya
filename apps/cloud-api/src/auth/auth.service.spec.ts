import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DbService } from "../db/db.service.js";
import { AuthService } from "./auth.service.js";

function makeDbMock() {
  return {
    queryUnscoped: vi.fn(),
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn(),
    withTransaction: vi.fn(),
  } as unknown as DbService & {
    queryUnscoped: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    queryOne: ReturnType<typeof vi.fn>;
  };
}

function makeJwtMock() {
  return { signAsync: vi.fn().mockResolvedValue("signed-token"), verifyAsync: vi.fn() };
}

function makeConfigMock() {
  return { get: vi.fn((_key: string, fallback?: unknown) => fallback) };
}

const PASSWORD = "correct-horse-battery-staple";
let passwordHash: string;

describe("AuthService.login", () => {
  let db: ReturnType<typeof makeDbMock>;
  let service: AuthService;

  beforeEach(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
    db = makeDbMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AuthService(db, makeJwtMock() as any, makeConfigMock() as any);
  });

  function mockUserFound(overrides: Partial<{ status: string }> = {}) {
    db.queryUnscoped.mockResolvedValueOnce([
      {
        id: "user-1",
        tenant_id: "tenant-1",
        branch_id: "branch-1",
        full_name: "Teacher",
        email: "teacher@example.com",
        password_hash: passwordHash,
      },
    ]);
    db.queryOne.mockResolvedValueOnce(overrides.status ? { status: overrides.status } : null);
  }

  it("logs in a user with no linked staff record", async () => {
    mockUserFound();

    const result = await service.login("teacher@example.com", PASSWORD);
    expect(result.access_token).toBe("signed-token");
  });

  it("embeds the user's branch_id in both the access and refresh token payloads", async () => {
    mockUserFound();
    const jwt = makeJwtMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scopedService = new AuthService(db, jwt as any, makeConfigMock() as any);

    await scopedService.login("teacher@example.com", PASSWORD);

    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ branch_id: "branch-1", type: "access" }),
      expect.anything(),
    );
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ branch_id: "branch-1", type: "refresh" }),
      expect.anything(),
    );
  });

  it("embeds branch_id: null for an unscoped user (e.g. super_admin)", async () => {
    db.queryUnscoped.mockResolvedValueOnce([
      {
        id: "user-1",
        tenant_id: "tenant-1",
        branch_id: null,
        full_name: "Admin",
        email: "admin@example.com",
        password_hash: passwordHash,
      },
    ]);
    db.queryOne.mockResolvedValueOnce(null);
    const jwt = makeJwtMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scopedService = new AuthService(db, jwt as any, makeConfigMock() as any);

    await scopedService.login("admin@example.com", PASSWORD);

    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ branch_id: null }), expect.anything());
  });

  it("logs in a staff member whose linked Staff.status is active", async () => {
    mockUserFound({ status: "active" });

    const result = await service.login("teacher@example.com", PASSWORD);
    expect(result.access_token).toBe("signed-token");
  });

  it("logs in a staff member on_leave", async () => {
    mockUserFound({ status: "on_leave" });

    await expect(service.login("teacher@example.com", PASSWORD)).resolves.toBeDefined();
  });

  it("rejects a relieved staff member even with the correct password", async () => {
    mockUserFound({ status: "relieved" });

    await expect(service.login("teacher@example.com", PASSWORD)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a terminated staff member", async () => {
    mockUserFound({ status: "terminated" });

    await expect(service.login("teacher@example.com", PASSWORD)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("still rejects a wrong password before ever checking staff status", async () => {
    db.queryUnscoped.mockResolvedValueOnce([
      {
        id: "user-1",
        tenant_id: "tenant-1",
        branch_id: "branch-1",
        full_name: "Teacher",
        email: "teacher@example.com",
        password_hash: passwordHash,
      },
    ]);

    await expect(service.login("teacher@example.com", "wrong-password")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it("searches across every tenant by email via the unscoped path, since the tenant isn't known yet", async () => {
    mockUserFound();

    await service.login("teacher@example.com", PASSWORD);

    expect(db.queryUnscoped).toHaveBeenCalledWith(expect.stringContaining("FROM users"), ["teacher@example.com"]);
  });

  describe("with a subdomain", () => {
    function mockTenantAndUserFound(overrides: Partial<{ status: string }> = {}) {
      db.queryUnscoped.mockResolvedValueOnce([{ id: "tenant-1" }]);
      db.queryOne.mockResolvedValueOnce({
        id: "user-1",
        tenant_id: "tenant-1",
        branch_id: "branch-1",
        full_name: "Teacher",
        email: "teacher@example.com",
        password_hash: passwordHash,
      });
      db.queryOne.mockResolvedValueOnce(overrides.status ? { status: overrides.status } : null);
    }

    it("resolves the tenant from the subdomain and scopes the user lookup to it", async () => {
      mockTenantAndUserFound();

      const result = await service.login("teacher@example.com", PASSWORD, "greenwood");

      expect(result.access_token).toBe("signed-token");
      expect(db.queryUnscoped).toHaveBeenCalledWith(expect.stringContaining("FROM tenants"), ["greenwood"]);
      expect(db.queryOne).toHaveBeenNthCalledWith(
        1,
        "tenant-1",
        expect.stringContaining("tenant_id = $1 AND email = $2"),
        ["tenant-1", "teacher@example.com"],
      );
    });

    it("rejects an unknown subdomain the same way as a bad password, without ever looking up a user", async () => {
      db.queryUnscoped.mockResolvedValueOnce([]);

      await expect(service.login("teacher@example.com", PASSWORD, "no-such-school")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(db.queryOne).not.toHaveBeenCalled();
    });

    it("still rejects a relieved staff member resolved via a subdomain", async () => {
      mockTenantAndUserFound({ status: "relieved" });

      await expect(service.login("teacher@example.com", PASSWORD, "greenwood")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("never falls back to the cross-tenant scan once a subdomain resolves to a tenant", async () => {
      mockTenantAndUserFound();

      await service.login("teacher@example.com", PASSWORD, "greenwood");

      // The only queryUnscoped call is the subdomain->tenant lookup itself --
      // the user lookup went through the normal RLS-scoped queryOne path.
      expect(db.queryUnscoped).toHaveBeenCalledTimes(1);
    });
  });
});
