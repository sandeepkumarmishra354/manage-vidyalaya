import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import type { JwtPayload } from "../auth/jwt.strategy.js";

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
// A user with no home branch (e.g. super_admin) passes through unchanged,
// keeping today's cross-branch access.
@Injectable()
export class BranchScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;
    if (!user?.branch_id) {
      return true;
    }

    if (request.body && typeof request.body === "object") {
      (request.body as Record<string, unknown>).branch_id = user.branch_id;
    }
    if (request.query && typeof request.query === "object") {
      (request.query as Record<string, unknown>).branch_id = user.branch_id;
    }

    return true;
  }
}
