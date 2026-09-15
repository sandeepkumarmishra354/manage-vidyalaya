import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { ModuleSettingsController } from "./module-settings.controller.js";
import { ModuleSettingsService } from "./module-settings.service.js";

@Module({
  imports: [AuditModule],
  controllers: [ModuleSettingsController],
  providers: [ModuleSettingsService],
})
export class ModuleSettingsModule {}
