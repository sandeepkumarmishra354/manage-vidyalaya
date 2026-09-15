import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import {
  ClassElectiveGroupsController,
  ClassSubjectItemController,
  ClassSubjectsController,
  ElectiveGroupsController,
} from "./class-subjects.controller.js";
import { ClassSubjectsService } from "./class-subjects.service.js";

@Module({
  imports: [AuditModule],
  controllers: [ClassSubjectsController, ClassSubjectItemController, ClassElectiveGroupsController, ElectiveGroupsController],
  providers: [ClassSubjectsService],
  exports: [ClassSubjectsService],
})
export class ClassSubjectsModule {}
