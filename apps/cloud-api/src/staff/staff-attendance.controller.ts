import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { StaffAttendanceService } from "./staff-attendance.service.js";
import { MarkStaffAttendanceDto } from "./dto/mark-staff-attendance.dto.js";

@Controller("staff-attendance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffAttendanceController {
  constructor(private readonly staffAttendanceService: StaffAttendanceService) {}

  @Get("roster")
  @RequirePermission("staff_attendance.view")
  roster(@Query("branch_id") branchId: string, @Query("attendance_date") attendanceDate: string) {
    return this.staffAttendanceService.getRoster(branchId, attendanceDate);
  }

  @Post()
  @RequirePermission("staff_attendance.mark")
  mark(@CurrentUser() user: JwtPayload, @Body() dto: MarkStaffAttendanceDto) {
    return this.staffAttendanceService.markAttendance(user.tenant_id, user.sub, dto);
  }

  @Get("staff/:staffId/history")
  @RequirePermission("staff_attendance.view")
  history(@Param("staffId") staffId: string) {
    return this.staffAttendanceService.getStaffHistory(staffId);
  }
}
