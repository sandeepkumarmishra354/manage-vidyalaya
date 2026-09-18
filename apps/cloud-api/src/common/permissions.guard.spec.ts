import { ForbiddenException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PermissionsGuard } from "./permissions.guard.js";
import type { ScopedAccessService } from "./scoped-access.service.js";

function makeContext(user: unknown) {
  return {
    getHandler: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

const TENANT_USER = { sub: "user-1", tenant_id: "tenant-1" };

describe("PermissionsGuard", () => {
  let scopedAccess: { hasPermission: ReturnType<typeof vi.fn> };
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    scopedAccess = { hasPermission: vi.fn() };
    reflector = { get: vi.fn() } as unknown as Reflector;
    guard = new PermissionsGuard(reflector, scopedAccess as unknown as ScopedAccessService);
  });

  it("allows the request through when the handler requires no permission", async () => {
    (reflector.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const result = await guard.canActivate(makeContext(TENANT_USER));
    expect(result).toBe(true);
    expect(scopedAccess.hasPermission).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request when a permission is required", async () => {
    (reflector.get as ReturnType<typeof vi.fn>).mockReturnValue("users.manage");
    await expect(guard.canActivate(makeContext(undefined))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a user whose roles don't grant the required permission", async () => {
    (reflector.get as ReturnType<typeof vi.fn>).mockReturnValue("users.manage");
    scopedAccess.hasPermission.mockResolvedValueOnce(false);

    await expect(guard.canActivate(makeContext(TENANT_USER))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows a user whose role grants the required permission", async () => {
    (reflector.get as ReturnType<typeof vi.fn>).mockReturnValue("users.manage");
    scopedAccess.hasPermission.mockResolvedValueOnce(true);

    const result = await guard.canActivate(makeContext(TENANT_USER));
    expect(result).toBe(true);
    expect(scopedAccess.hasPermission).toHaveBeenCalledWith("tenant-1", "user-1", "users.manage");
  });

  it("allows a user who holds any one of several required permissions (OR)", async () => {
    (reflector.get as ReturnType<typeof vi.fn>).mockReturnValue(["staff.manage_profile", "master_data.manage_staff_category"]);
    scopedAccess.hasPermission.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const result = await guard.canActivate(makeContext(TENANT_USER));
    expect(result).toBe(true);
    expect(scopedAccess.hasPermission).toHaveBeenCalledWith("tenant-1", "user-1", "staff.manage_profile");
    expect(scopedAccess.hasPermission).toHaveBeenCalledWith("tenant-1", "user-1", "master_data.manage_staff_category");
  });

  it("rejects a user who holds none of several required permissions", async () => {
    (reflector.get as ReturnType<typeof vi.fn>).mockReturnValue(["staff.manage_profile", "master_data.manage_staff_category"]);
    scopedAccess.hasPermission.mockResolvedValue(false);

    await expect(guard.canActivate(makeContext(TENANT_USER))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
