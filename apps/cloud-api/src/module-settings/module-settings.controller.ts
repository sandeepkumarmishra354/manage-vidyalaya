import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { ModuleSettingsService } from "./module-settings.service.js";

@Controller("module-settings")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ModuleSettingsController {
  constructor(private readonly moduleSettingsService: ModuleSettingsService) {}

  @Get()
  get(@Query("branch_id") branchId: string) {
    return this.moduleSettingsService.getModuleSettings(branchId);
  }
}
