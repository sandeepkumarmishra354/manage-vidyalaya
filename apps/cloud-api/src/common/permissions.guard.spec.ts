import { ForbiddenException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../prisma/prisma.service.js";
import { PermissionsGuard } from "./permissions.guard.js";

function makeContext(user: unknown) {
  return {
    getHandler: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe("PermissionsGuard", () => {
  let prisma: { userRole: { findMany: ReturnType<typeof vi.fn> }; rolePermission: { findFirst: ReturnType<typeof vi.fn> } };
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    prisma = {
      userRole: { findMany: vi.fn() },
      rolePermission: { findFirst: vi.fn() },
    };
    reflector = { get: vi.fn() } as unknown as Reflector;
    guard = new PermissionsGuard(reflector, prisma as unknown as PrismaService);
  });

  it("allows the request through when the handler requires no permission", async () => {
    (reflector.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const result = await guard.canActivate(makeContext({ sub: "user-1" }));
    expect(result).toBe(true);
  });

  it("rejects an unauthenticated request when a permission is required", async () => {
    (reflector.get as ReturnType<typeof vi.fn>).mockReturnValue("users.manage");
    await expect(guard.canActivate(makeContext(undefined))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a user with no roles", async () => {
    (reflector.get as ReturnType<typeof vi.fn>).mockReturnValue("users.manage");
    prisma.userRole.findMany.mockResolvedValueOnce([]);

    await expect(guard.canActivate(makeContext({ sub: "user-1" }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a user whose roles don't grant the required permission", async () => {
    (reflector.get as ReturnType<typeof vi.fn>).mockReturnValue("users.manage");
    prisma.userRole.findMany.mockResolvedValueOnce([{ roleId: "role-teacher" }]);
    prisma.rolePermission.findFirst.mockResolvedValueOnce(null);

    await expect(guard.canActivate(makeContext({ sub: "user-1" }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows a user whose role grants the required permission", async () => {
    (reflector.get as ReturnType<typeof vi.fn>).mockReturnValue("users.manage");
    prisma.userRole.findMany.mockResolvedValueOnce([{ roleId: "role-admin" }]);
    prisma.rolePermission.findFirst.mockResolvedValueOnce({ id: "grant-1" });

    const result = await guard.canActivate(makeContext({ sub: "user-1" }));
    expect(result).toBe(true);
  });

  it("queries fresh from the database rather than trusting a stale JWT roles claim", async () => {
    (reflector.get as ReturnType<typeof vi.fn>).mockReturnValue("users.manage");
    prisma.userRole.findMany.mockResolvedValueOnce([{ roleId: "role-admin" }]);
    prisma.rolePermission.findFirst.mockResolvedValueOnce({ id: "grant-1" });

    await guard.canActivate(makeContext({ sub: "user-1", roles: ["some-stale-role-name"] }));

    expect(prisma.userRole.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { roleId: true },
    });
  });
});
