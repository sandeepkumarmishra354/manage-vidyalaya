import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { ModuleSettingsService } from "./module-settings.service.js";

@Controller("module-settings")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ModuleSettingsController {
  constructor(private readonly moduleSettingsService: ModuleSettingsService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string) {
    return this.moduleSettingsService.getModuleSettings(user.tenant_id, branchId);
  }
}
