import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { StaffDocumentsController, StudentDocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [StudentDocumentsController, StaffDocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
