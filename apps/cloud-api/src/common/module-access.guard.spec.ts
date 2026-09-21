import { ForbiddenException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModuleAccessGuard } from "./module-access.guard.js";
import type { PlanLimitsService } from "./plan-limits.service.js";

function makeContext(user: unknown, body: unknown = {}, query: unknown = {}) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user, body, query }) }),
  } as any;
}

const BRANCH_USER = { sub: "user-1", tenant_id: "tenant-1", branch_id: "branch-1" };
const TENANT_WIDE_USER = { sub: "user-1", tenant_id: "tenant-1", branch_id: null };

describe("ModuleAccessGuard", () => {
  let planLimits: { isModuleEnabled: ReturnType<typeof vi.fn> };
  let reflector: Reflector;
  let guard: ModuleAccessGuard;

  beforeEach(() => {
    planLimits = { isModuleEnabled: vi.fn() };
    reflector = { getAllAndOverride: vi.fn() } as unknown as Reflector;
    guard = new ModuleAccessGuard(reflector, planLimits as unknown as PlanLimitsService);
  });

  it("allows the request through when the handler requires no module", async () => {
    (reflector.getAllAndOverride as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const result = await guard.canActivate(makeContext(BRANCH_USER));
    expect(result).toBe(true);
    expect(planLimits.isModuleEnabled).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request when a module is required", async () => {
    (reflector.getAllAndOverride as ReturnType<typeof vi.fn>).mockReturnValue("payroll");
    await expect(guard.canActivate(makeContext(undefined))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects when the tenant's plan/branch toggle excludes the module", async () => {
    (reflector.getAllAndOverride as ReturnType<typeof vi.fn>).mockReturnValue("payroll");
    planLimits.isModuleEnabled.mockResolvedValueOnce(false);

    await expect(guard.canActivate(makeContext(BRANCH_USER))).rejects.toBeInstanceOf(ForbiddenException);
    expect(planLimits.isModuleEnabled).toHaveBeenCalledWith("tenant-1", "branch-1", "payroll");
  });

  it("allows when the module is eligible and enabled for the caller's branch", async () => {
    (reflector.getAllAndOverride as ReturnType<typeof vi.fn>).mockReturnValue("payroll");
    planLimits.isModuleEnabled.mockResolvedValueOnce(true);

    const result = await guard.canActivate(makeContext(BRANCH_USER));
    expect(result).toBe(true);
  });

  it("falls back to the request body's branch_id for a tenant-wide caller", async () => {
    (reflector.getAllAndOverride as ReturnType<typeof vi.fn>).mockReturnValue("library");
    planLimits.isModuleEnabled.mockResolvedValueOnce(true);

    await guard.canActivate(makeContext(TENANT_WIDE_USER, { branch_id: "branch-9" }));
    expect(planLimits.isModuleEnabled).toHaveBeenCalledWith("tenant-1", "branch-9", "library");
  });

  it("falls back to the request query's branch_id when the body has none", async () => {
    (reflector.getAllAndOverride as ReturnType<typeof vi.fn>).mockReturnValue("library");
    planLimits.isModuleEnabled.mockResolvedValueOnce(true);

    await guard.canActivate(makeContext(TENANT_WIDE_USER, {}, { branch_id: "branch-9" }));
    expect(planLimits.isModuleEnabled).toHaveBeenCalledWith("tenant-1", "branch-9", "library");
  });

  it("does a tier-only check (branchId null) for a tenant-wide caller with no branch_id anywhere in the request", async () => {
    (reflector.getAllAndOverride as ReturnType<typeof vi.fn>).mockReturnValue("leave");
    planLimits.isModuleEnabled.mockResolvedValueOnce(true);

    await guard.canActivate(makeContext(TENANT_WIDE_USER, {}, {}));
    expect(planLimits.isModuleEnabled).toHaveBeenCalledWith("tenant-1", null, "leave");
  });
});
