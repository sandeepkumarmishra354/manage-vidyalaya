import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { HousesController } from "./houses.controller.js";
import { HousesService } from "./houses.service.js";

@Module({
  imports: [AuditModule],
  controllers: [HousesController],
  providers: [HousesService],
})
export class HousesModule {}
