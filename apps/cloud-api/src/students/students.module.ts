import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { FeesModule } from "../fees/fees.module.js";
import { AdmissionsController, GuardiansController, StudentsController } from "./students.controller.js";
import { StudentsService } from "./students.service.js";

@Module({
  imports: [AuditModule, FeesModule],
  controllers: [StudentsController, GuardiansController, AdmissionsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
