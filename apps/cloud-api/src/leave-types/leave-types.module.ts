import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { LeaveTypesController } from "./leave-types.controller.js";
import { LeaveTypesService } from "./leave-types.service.js";

@Module({
  imports: [AuditModule],
  controllers: [LeaveTypesController],
  providers: [LeaveTypesService],
  exports: [LeaveTypesService],
})
export class LeaveTypesModule {}
