import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { ClassSubjectsModule } from "../class-subjects/class-subjects.module.js";
import { ExamsController, SubjectsController } from "./exams.controller.js";
import { ExamsService } from "./exams.service.js";

@Module({
  imports: [AuditModule, ClassSubjectsModule],
  controllers: [SubjectsController, ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
