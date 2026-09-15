import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { TransportAssignmentsController, TransportRoutesController, TransportStopsController } from "./transport.controller.js";
import { TransportService } from "./transport.service.js";

@Module({
  imports: [AuditModule],
  controllers: [TransportRoutesController, TransportStopsController, TransportAssignmentsController],
  providers: [TransportService],
})
export class TransportModule {}
