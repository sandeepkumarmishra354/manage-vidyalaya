import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import {
  AcademicSessionsController,
  BranchesController,
  ClassesController,
  SectionsController,
} from "./academic.controller.js";
import { AcademicService } from "./academic.service.js";

@Module({
  imports: [AuditModule],
  controllers: [BranchesController, AcademicSessionsController, ClassesController, SectionsController],
  providers: [AcademicService],
})
export class AcademicModule {}
