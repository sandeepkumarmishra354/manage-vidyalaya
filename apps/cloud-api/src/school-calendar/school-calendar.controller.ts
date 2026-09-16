import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CreateHolidayDto } from "./dto/create-holiday.dto.js";
import { SetWeeklyRuleDto } from "./dto/set-weekly-rule.dto.js";
import { UpdateHolidayDto } from "./dto/update-holiday.dto.js";
import { SchoolCalendarService } from "./school-calendar.service.js";

// Reads (calendar shape + day-types) are open to any authenticated user --
// this isn't sensitive data, and many different features across roles need
// it (a teacher's attendance grid, an accountant's payroll run, the
// dashboard's upcoming-holidays widget). Only mutations are permission-gated.
@Controller("school-calendar")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SchoolCalendarController {
  constructor(private readonly schoolCalendarService: SchoolCalendarService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string, @Query("academic_session_id") academicSessionId: string) {
    return this.schoolCalendarService.getCalendar(user.tenant_id, branchId, academicSessionId);
  }

  @Get("day-types")
  dayTypes(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("start_date") startDate: string,
    @Query("end_date") endDate: string,
  ) {
    return this.schoolCalendarService.getDayTypesInRange(user.tenant_id, branchId, startDate, endDate);
  }

  @Post("weekly-rule")
  @RequirePermission("academic_setup.manage_sessions")
  setWeeklyRule(@CurrentUser() user: JwtPayload, @Body() dto: SetWeeklyRuleDto) {
    return this.schoolCalendarService.setWeeklyRule(user.tenant_id, user.sub, dto);
  }

  @Post("holidays")
  @RequirePermission("academic_setup.manage_sessions")
  addHoliday(@CurrentUser() user: JwtPayload, @Body() dto: CreateHolidayDto) {
    return this.schoolCalendarService.addHoliday(user.tenant_id, user.sub, dto);
  }
}

@Controller("calendar-holidays")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CalendarHolidaysController {
  constructor(private readonly schoolCalendarService: SchoolCalendarService) {}

  @Patch(":id")
  @RequirePermission("academic_setup.manage_sessions")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateHolidayDto) {
    return this.schoolCalendarService.updateHoliday(user.tenant_id, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermission("academic_setup.manage_sessions")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.schoolCalendarService.deleteHoliday(user.tenant_id, user.sub, id);
  }
}
