import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
@UseGuards(JwtAuthGuard, BranchScopeGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("stats")
  stats(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string) {
    return this.dashboardService.getStats(user.tenant_id, user.sub, branchId);
  }

  @Get("needs-attention")
  needsAttention(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string) {
    return this.dashboardService.getNeedsAttention(user.tenant_id, user.sub, branchId);
  }
}
