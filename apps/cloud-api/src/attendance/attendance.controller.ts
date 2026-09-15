import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { AttendanceService } from "./attendance.service.js";
import { BulkMarkAttendanceDto } from "./dto/bulk-mark-attendance.dto.js";
import { MarkAttendanceDto } from "./dto/mark-attendance.dto.js";

// roster/mark/bulk have no @RequirePermission -- authorization is additive
// (attendance.view/attendance.mark OR being the section's class teacher),
// which PermissionsGuard's flat model can't express, so these routes check
// explicitly via AttendanceService.assertCanView/assertCanMark instead.
// PermissionsGuard stays on the class for the routes that do use
// @RequirePermission (it no-ops on handlers with no metadata).
@Controller("attendance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get("roster")
  async roster(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("class_id") classId: string,
    @Query("attendance_date") attendanceDate: string,
    @Query("section_id") sectionId?: string,
  ) {
    await this.attendanceService.assertCanView(user.tenant_id, user.sub, sectionId);
    return this.attendanceService.getRoster(user.tenant_id, branchId, classId, sectionId, attendanceDate);
  }

  @Get("roster-range")
  async rosterRange(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("class_id") classId: string,
    @Query("start_date") startDate: string,
    @Query("end_date") endDate: string,
    @Query("section_id") sectionId?: string,
  ) {
    await this.attendanceService.assertCanView(user.tenant_id, user.sub, sectionId);
    return this.attendanceService.getRosterRange(user.tenant_id, branchId, classId, sectionId, startDate, endDate);
  }

  // Non-throwing: lets the frontend decide whether to show the "Save"
  // affordance for a section without a guess-and-fail round trip.
  @Get("can-mark")
  async canMark(@CurrentUser() user: JwtPayload, @Query("section_id") sectionId?: string) {
    return { can_mark: await this.attendanceService.canMark(user.tenant_id, user.sub, sectionId) };
  }

  @Post()
  async mark(@CurrentUser() user: JwtPayload, @Body() dto: MarkAttendanceDto) {
    await this.attendanceService.assertCanMark(user.tenant_id, user.sub, dto.section_id);
    return this.attendanceService.markAttendance(user.tenant_id, user.sub, dto);
  }

  @Post("bulk")
  async markBulk(@CurrentUser() user: JwtPayload, @Body() dto: BulkMarkAttendanceDto) {
    await this.attendanceService.assertCanMark(user.tenant_id, user.sub, dto.section_id);
    return this.attendanceService.markAttendanceBulk(user.tenant_id, user.sub, dto);
  }

  @Get("student/:studentId/history")
  @RequirePermission("attendance.view")
  history(@Param("studentId") studentId: string) {
    return this.attendanceService.getStudentHistory(studentId);
  }
}
