import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { StaffAttendanceService } from "./staff-attendance.service.js";
import { BulkMarkStaffAttendanceDto } from "./dto/bulk-mark-staff-attendance.dto.js";
import { MarkStaffAttendanceDto } from "./dto/mark-staff-attendance.dto.js";
import { ScanStaffAttendanceDto } from "./dto/scan-staff-attendance.dto.js";

@Controller("staff-attendance")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class StaffAttendanceController {
  constructor(private readonly staffAttendanceService: StaffAttendanceService) {}

  @Get("roster")
  @RequirePermission("staff_attendance.view")
  roster(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("attendance_date") attendanceDate: string,
  ) {
    return this.staffAttendanceService.getRoster(user.tenant_id, branchId, attendanceDate);
  }

  @Get("roster-range")
  @RequirePermission("staff_attendance.view")
  rosterRange(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("start_date") startDate: string,
    @Query("end_date") endDate: string,
  ) {
    return this.staffAttendanceService.getRosterRange(user.tenant_id, branchId, startDate, endDate);
  }

  @Post()
  @RequirePermission("staff_attendance.mark")
  mark(@CurrentUser() user: JwtPayload, @Body() dto: MarkStaffAttendanceDto) {
    return this.staffAttendanceService.markAttendance(user.tenant_id, user.sub, dto);
  }

  @Post("bulk")
  @RequirePermission("staff_attendance.mark")
  markBulk(@CurrentUser() user: JwtPayload, @Body() dto: BulkMarkStaffAttendanceDto) {
    return this.staffAttendanceService.markAttendanceBulk(user.tenant_id, user.sub, dto);
  }

  @Post("scan")
  @RequirePermission("staff_attendance.mark")
  scan(@CurrentUser() user: JwtPayload, @Body() dto: ScanStaffAttendanceDto) {
    return this.staffAttendanceService.scanMark(user.tenant_id, user.sub, dto.token, user.branch_id);
  }

  @Get("staff/:staffId/history")
  @RequirePermission("staff_attendance.view")
  history(@CurrentUser() user: JwtPayload, @Param("staffId") staffId: string) {
    return this.staffAttendanceService.getStaffHistory(user.tenant_id, staffId, user.branch_id);
  }

  @Get("report")
  @RequirePermission("staff_attendance.view")
  report(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("start_date") startDate: string,
    @Query("end_date") endDate: string,
  ) {
    return this.staffAttendanceService.getReport(user.tenant_id, branchId, startDate, endDate);
  }
}
