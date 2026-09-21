import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { JwtPayload } from "../auth/jwt.strategy.js";
import { MODULE_KEY } from "./require-module.decorator.js";
import { PlanLimitsService } from "./plan-limits.service.js";
import type { ToggleableModule } from "./permission-catalog.js";

// Must run after JwtAuthGuard (so `request.user` is populated) and after
// BranchScopeGuard (so a branch-scoped caller's request.body/query.branch_id
// has already been forced to their own branch, never client-trusted).
// Closes the gap where a module a tenant's plan tier excludes (e.g. every
// toggleable module on Silver) was previously only hidden from the
// frontend nav -- @RequirePermission alone let any user with the right
// RBAC grant call these endpoints directly regardless of plan tier.
@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<ToggleableModule | undefined>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredModule) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;
    if (!user) {
      throw new ForbiddenException("not authorized");
    }

    // Tenant-wide caller (branch_id null on the token) falls back to
    // whatever branch_id the request itself carries (most create DTOs for
    // these modules require one); if neither is present, isModuleEnabled
    // does a tier-only check -- still closes the critical hole (a Silver
    // tenant's plan excludes every toggleable module outright), just
    // without also consulting that one branch's module_settings toggle.
    const body = request.body as Record<string, unknown> | undefined;
    const query = request.query as Record<string, unknown> | undefined;
    const branchId: string | null =
      user.branch_id ?? (body?.branch_id as string | undefined) ?? (query?.branch_id as string | undefined) ?? null;

    const enabled = await this.planLimits.isModuleEnabled(user.tenant_id, branchId, requiredModule);
    if (!enabled) {
      throw new ForbiddenException("This module is not available on your school's plan.");
    }

    return true;
  }
}
