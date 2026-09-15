import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { ExamsController, SubjectsController } from "./exams.controller.js";
import { ExamsService } from "./exams.service.js";

@Module({
  imports: [AuditModule],
  controllers: [SubjectsController, ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
