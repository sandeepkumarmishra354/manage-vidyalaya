import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { SetModuleEnabledDto } from "./dto/set-module-enabled.dto.js";
import { ModuleSettingsService } from "./module-settings.service.js";

@Controller("module-settings")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ModuleSettingsController {
  constructor(private readonly moduleSettingsService: ModuleSettingsService) {}

  @Get()
  get(@Query("branch_id") branchId: string) {
    return this.moduleSettingsService.getModuleSettings(branchId);
  }

  @Post()
  @RequirePermission("module_settings.manage")
  set(@CurrentUser() user: JwtPayload, @Body() dto: SetModuleEnabledDto) {
    return this.moduleSettingsService.setModuleEnabled(user.tenant_id, user.sub, dto);
  }
}
