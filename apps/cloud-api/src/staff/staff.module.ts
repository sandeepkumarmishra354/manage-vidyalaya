import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { LeaveTypesModule } from "../leave-types/leave-types.module.js";
import { QrModule } from "../qr/qr.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { StaffAttendanceController } from "./staff-attendance.controller.js";
import { StaffAttendanceService } from "./staff-attendance.service.js";
import { StaffLeaveController } from "./staff-leave.controller.js";
import { StaffLeaveService } from "./staff-leave.service.js";
import { SectionClassTeacherController, StaffController, TeacherAssignmentsController } from "./staff.controller.js";
import { StaffService } from "./staff.service.js";

@Module({
  imports: [AuditModule, QrModule, StorageModule, LeaveTypesModule],
  controllers: [
    StaffController,
    TeacherAssignmentsController,
    SectionClassTeacherController,
    StaffAttendanceController,
    StaffLeaveController,
  ],
  providers: [StaffService, StaffAttendanceService, StaffLeaveService],
})
export class StaffModule {}
