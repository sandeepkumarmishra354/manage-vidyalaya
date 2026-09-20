import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";

import type { JwtPayload } from "../auth/jwt.strategy.js";
import { ScopedAccessService } from "./scoped-access.service.js";

// When the acting user has a home branch (JwtPayload.branch_id -- set for a
// per-branch admin or staff member), this guard overwrites any
// client-submitted `branch_id` in the request body or query string with the
// caller's own branch, before it ever reaches DTO validation or the
// controller. The server never trusts a branch_id the client sends once a
// user is branch-scoped -- this is the single choke point for that, applied
// alongside JwtAuthGuard/PermissionsGuard on every controller.
//
// Safe to apply unconditionally to every route, including ones whose DTO
// has no branch_id field at all: ValidationPipe is configured with
// `whitelist: true` (not `forbidNonWhitelisted`), so an extra branch_id
// on a body that doesn't declare it is silently stripped, never rejected.
//
// A null branch_id on the token is NOT taken at face value as "unrestricted,
// tenant-wide access" -- that would be fail-open: a user can have a null
// branch_id simply because their account is misconfigured/incomplete, not
// because they're intentionally cross-branch. Instead we verify fresh
// against the DB that this user actually holds `roles.manage`, the one
// permission uniquely granted to `super_admin` among the seeded system
// roles (see permission-catalog.ts) -- a genuine proxy for "this account is
// meant to see every branch." Anyone else with a null branch_id is denied,
// fail closed, rather than silently granted full access.
@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(private readonly scopedAccess: ScopedAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;
    if (!user) {
      return true;
    }

    if (user.branch_id) {
      this.forceBranch(request, user.branch_id);
      return true;
    }

    const isTenantWide = await this.scopedAccess.hasPermission(user.tenant_id, user.sub, "roles.manage");
    if (!isTenantWide) {
      throw new ForbiddenException("Your account has no branch assigned. Contact your administrator.");
    }

    return true;
  }

  private forceBranch(request: Request, branchId: string) {
    if (request.body && typeof request.body === "object") {
      (request.body as Record<string, unknown>).branch_id = branchId;
    }
    if (request.query && typeof request.query === "object") {
      (request.query as Record<string, unknown>).branch_id = branchId;
    }
  }
}
