import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { FeesModule } from "../fees/fees.module.js";
import { QrModule } from "../qr/qr.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { AdmissionsController, GuardiansController, StudentsController } from "./students.controller.js";
import { StudentsService } from "./students.service.js";

@Module({
  imports: [AuditModule, FeesModule, QrModule, StorageModule],
  controllers: [StudentsController, GuardiansController, AdmissionsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
