import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("stats")
  stats(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string) {
    return this.dashboardService.getStats(user.tenant_id, user.sub, branchId);
  }
}
