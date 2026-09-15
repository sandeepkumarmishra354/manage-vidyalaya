import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { StaffAttendanceController } from "./staff-attendance.controller.js";
import { StaffAttendanceService } from "./staff-attendance.service.js";
import { SectionClassTeacherController, StaffController, TeacherAssignmentsController } from "./staff.controller.js";
import { StaffService } from "./staff.service.js";

@Module({
  imports: [AuditModule],
  controllers: [StaffController, TeacherAssignmentsController, SectionClassTeacherController, StaffAttendanceController],
  providers: [StaffService, StaffAttendanceService],
})
export class StaffModule {}
