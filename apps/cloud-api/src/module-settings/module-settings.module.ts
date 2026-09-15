import { Module } from "@nestjs/common";

import { ModuleSettingsController } from "./module-settings.controller.js";
import { ModuleSettingsService } from "./module-settings.service.js";

@Module({
  controllers: [ModuleSettingsController],
  providers: [ModuleSettingsService],
})
export class ModuleSettingsModule {}
