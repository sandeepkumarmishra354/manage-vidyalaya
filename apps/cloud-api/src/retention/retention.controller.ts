import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { UpdateRetentionPolicyDto } from "./dto/update-retention-policy.dto.js";
import { RetentionService } from "./retention.service.js";

@Controller("retention-policies")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class RetentionController {
  constructor(private readonly retentionService: RetentionService) {}

  @Get()
  @RequirePermission("data_retention.manage")
  list(@CurrentUser() user: JwtPayload) {
    return this.retentionService.listPolicies(user.tenant_id);
  }

  // Registered before ":category" so "preview" isn't swallowed as a
  // category value.
  @Get("preview")
  @RequirePermission("data_retention.manage")
  preview(@CurrentUser() user: JwtPayload) {
    return this.retentionService.previewEligibleCounts(user.tenant_id);
  }

  @Patch(":category")
  @RequirePermission("data_retention.manage")
  update(@CurrentUser() user: JwtPayload, @Param("category") category: string, @Body() dto: UpdateRetentionPolicyDto) {
    return this.retentionService.updatePolicy(user.tenant_id, user.sub, category, dto.retention_years);
  }
}
