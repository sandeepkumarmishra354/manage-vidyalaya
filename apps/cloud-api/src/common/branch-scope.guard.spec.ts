import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { BranchScopeGuard } from "./branch-scope.guard.js";

function makeContext(user: unknown, body: Record<string, unknown> = {}, query: Record<string, unknown> = {}) {
  const request = { user, body, query };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("BranchScopeGuard", () => {
  const guard = new BranchScopeGuard();

  it("lets an unscoped user's request through untouched", () => {
    const context = makeContext(
      { sub: "user-1", tenant_id: "tenant-1", branch_id: null },
      { branch_id: "branch-attacker" },
      { branch_id: "branch-attacker" },
    );

    expect(guard.canActivate(context)).toBe(true);
    const request = context.switchToHttp().getRequest() as { body: Record<string, unknown>; query: Record<string, unknown> };
    expect(request.body.branch_id).toBe("branch-attacker");
    expect(request.query.branch_id).toBe("branch-attacker");
  });

  it("overwrites a client-submitted branch_id in the body for a branch-scoped user", () => {
    const context = makeContext(
      { sub: "user-1", tenant_id: "tenant-1", branch_id: "branch-mine" },
      { branch_id: "branch-someone-elses", name: "New Student" },
    );

    guard.canActivate(context);
    const request = context.switchToHttp().getRequest() as { body: Record<string, unknown> };
    expect(request.body.branch_id).toBe("branch-mine");
    expect(request.body.name).toBe("New Student");
  });

  it("overwrites a client-submitted branch_id in the query string for a branch-scoped user", () => {
    const context = makeContext(
      { sub: "user-1", tenant_id: "tenant-1", branch_id: "branch-mine" },
      {},
      { branch_id: "branch-someone-elses" },
    );

    guard.canActivate(context);
    const request = context.switchToHttp().getRequest() as { query: Record<string, unknown> };
    expect(request.query.branch_id).toBe("branch-mine");
  });

  it("sets branch_id even when the client omitted it entirely -- a branch-scoped user can't mint an unscoped record by leaving it out", () => {
    const context = makeContext(
      { sub: "user-1", tenant_id: "tenant-1", branch_id: "branch-mine" },
      { name: "New Student" },
    );

    guard.canActivate(context);
    const request = context.switchToHttp().getRequest() as { body: Record<string, unknown> };
    expect(request.body.branch_id).toBe("branch-mine");
  });

  it("does nothing when there's no authenticated user on the request", () => {
    const context = makeContext(undefined, { branch_id: "whatever" });

    expect(guard.canActivate(context)).toBe(true);
    const request = context.switchToHttp().getRequest() as { body: Record<string, unknown> };
    expect(request.body.branch_id).toBe("whatever");
  });
});
