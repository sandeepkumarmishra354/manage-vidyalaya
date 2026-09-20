import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { BranchScopeGuard } from "./branch-scope.guard.js";
import type { ScopedAccessService } from "./scoped-access.service.js";

function makeContext(user: unknown, body: Record<string, unknown> = {}, query: Record<string, unknown> = {}) {
  const request = { user, body, query };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeScopedAccessMock(hasPermission = false) {
  return { hasPermission: vi.fn().mockResolvedValue(hasPermission) } as unknown as ScopedAccessService & {
    hasPermission: ReturnType<typeof vi.fn>;
  };
}

describe("BranchScopeGuard", () => {
  it("overwrites a client-submitted branch_id in the body for a branch-scoped user", async () => {
    const scopedAccess = makeScopedAccessMock();
    const guard = new BranchScopeGuard(scopedAccess);
    const context = makeContext(
      { sub: "user-1", tenant_id: "tenant-1", branch_id: "branch-mine" },
      { branch_id: "branch-someone-elses", name: "New Student" },
    );

    await guard.canActivate(context);
    const request = context.switchToHttp().getRequest() as { body: Record<string, unknown> };
    expect(request.body.branch_id).toBe("branch-mine");
    expect(request.body.name).toBe("New Student");
    expect(scopedAccess.hasPermission).not.toHaveBeenCalled();
  });

  it("overwrites a client-submitted branch_id in the query string for a branch-scoped user", async () => {
    const scopedAccess = makeScopedAccessMock();
    const guard = new BranchScopeGuard(scopedAccess);
    const context = makeContext(
      { sub: "user-1", tenant_id: "tenant-1", branch_id: "branch-mine" },
      {},
      { branch_id: "branch-someone-elses" },
    );

    await guard.canActivate(context);
    const request = context.switchToHttp().getRequest() as { query: Record<string, unknown> };
    expect(request.query.branch_id).toBe("branch-mine");
  });

  it("sets branch_id even when the client omitted it entirely -- a branch-scoped user can't mint an unscoped record by leaving it out", async () => {
    const scopedAccess = makeScopedAccessMock();
    const guard = new BranchScopeGuard(scopedAccess);
    const context = makeContext({ sub: "user-1", tenant_id: "tenant-1", branch_id: "branch-mine" }, { name: "New Student" });

    await guard.canActivate(context);
    const request = context.switchToHttp().getRequest() as { body: Record<string, unknown> };
    expect(request.body.branch_id).toBe("branch-mine");
  });

  it("lets a null-branch_id user through unrestricted when they hold roles.manage (genuinely tenant-wide, e.g. super_admin)", async () => {
    const scopedAccess = makeScopedAccessMock(true);
    const guard = new BranchScopeGuard(scopedAccess);
    const context = makeContext(
      { sub: "user-1", tenant_id: "tenant-1", branch_id: null },
      { branch_id: "branch-attacker" },
      { branch_id: "branch-attacker" },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(scopedAccess.hasPermission).toHaveBeenCalledWith("tenant-1", "user-1", "roles.manage");
    const request = context.switchToHttp().getRequest() as { body: Record<string, unknown>; query: Record<string, unknown> };
    // unrestricted -- the client-submitted branch_id is left alone, not overwritten
    expect(request.body.branch_id).toBe("branch-attacker");
    expect(request.query.branch_id).toBe("branch-attacker");
  });

  it("fails closed -- rejects a null-branch_id user who does NOT hold roles.manage, rather than assuming unrestricted access", async () => {
    const scopedAccess = makeScopedAccessMock(false);
    const guard = new BranchScopeGuard(scopedAccess);
    const context = makeContext({ sub: "user-1", tenant_id: "tenant-1", branch_id: null }, {});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(scopedAccess.hasPermission).toHaveBeenCalledWith("tenant-1", "user-1", "roles.manage");
  });

  it("does nothing when there's no authenticated user on the request", async () => {
    const scopedAccess = makeScopedAccessMock();
    const guard = new BranchScopeGuard(scopedAccess);
    const context = makeContext(undefined, { branch_id: "whatever" });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const request = context.switchToHttp().getRequest() as { body: Record<string, unknown> };
    expect(request.body.branch_id).toBe("whatever");
    expect(scopedAccess.hasPermission).not.toHaveBeenCalled();
  });
});
