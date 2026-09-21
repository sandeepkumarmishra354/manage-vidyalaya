import { Controller, Get, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { PlanLimitsService } from "../common/plan-limits.service.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";

// Read-only self-service view backing the "Plan & Usage" panel in School
// Details -- gated behind academic_setup.view like the rest of that
// screen's data. Never a source of truth for enforcement; that lives in
// PlanLimitsService's other methods, called directly by the services that
// mutate the counted resources.
@Controller("tenants")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantsController {
  constructor(private readonly planLimits: PlanLimitsService) {}

  @Get("me/plan-usage")
  @RequirePermission("academic_setup.view")
  getPlanUsage(@CurrentUser() user: JwtPayload) {
    return this.planLimits.getPlanUsage(user.tenant_id);
  }
}
