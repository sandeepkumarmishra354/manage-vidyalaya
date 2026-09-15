import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { AttendanceService } from "./attendance.service.js";
import { MarkAttendanceDto } from "./dto/mark-attendance.dto.js";

@Controller("attendance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get("roster")
  @RequirePermission("attendance.view")
  roster(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("class_id") classId: string,
    @Query("attendance_date") attendanceDate: string,
    @Query("section_id") sectionId?: string,
  ) {
    return this.attendanceService.getRoster(user.tenant_id, branchId, classId, sectionId, attendanceDate);
  }

  @Post()
  @RequirePermission("attendance.mark")
  mark(@CurrentUser() user: JwtPayload, @Body() dto: MarkAttendanceDto) {
    return this.attendanceService.markAttendance(user.tenant_id, user.sub, dto);
  }

  @Get("student/:studentId/history")
  @RequirePermission("attendance.view")
  history(@Param("studentId") studentId: string) {
    return this.attendanceService.getStudentHistory(studentId);
  }
}
