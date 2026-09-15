import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { AdmissionsController, GuardiansController, StudentsController } from "./students.controller.js";
import { StudentsService } from "./students.service.js";

@Module({
  imports: [AuditModule],
  controllers: [StudentsController, GuardiansController, AdmissionsController],
  providers: [StudentsService],
})
export class StudentsModule {}
