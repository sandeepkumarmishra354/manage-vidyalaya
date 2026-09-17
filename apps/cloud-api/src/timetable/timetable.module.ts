import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { MyTimetableController, PeriodSlotsController, SectionTimetableController, StaffTimetableController } from "./timetable.controller.js";
import { TimetableService } from "./timetable.service.js";

@Module({
  imports: [AuditModule],
  controllers: [PeriodSlotsController, SectionTimetableController, StaffTimetableController, MyTimetableController],
  providers: [TimetableService],
  exports: [TimetableService],
})
export class TimetableModule {}
