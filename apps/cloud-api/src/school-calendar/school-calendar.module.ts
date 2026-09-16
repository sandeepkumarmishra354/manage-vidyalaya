import { Global, Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { CalendarHolidaysController, SchoolCalendarController } from "./school-calendar.controller.js";
import { SchoolCalendarService } from "./school-calendar.service.js";

// Global (matching CommonModule/PrismaModule's precedent) so
// AttendanceModule, StaffModule (staff attendance), and PayrollModule can
// inject SchoolCalendarService directly without importing this module.
@Global()
@Module({
  imports: [AuditModule],
  controllers: [SchoolCalendarController, CalendarHolidaysController],
  providers: [SchoolCalendarService],
  exports: [SchoolCalendarService],
})
export class SchoolCalendarModule {}
