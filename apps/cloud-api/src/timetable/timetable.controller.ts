import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { ScopedAccessService } from "../common/scoped-access.service.js";
import { CreatePeriodSlotDto } from "./dto/create-period-slot.dto.js";
import { SaveSectionTimetableDto } from "./dto/save-section-timetable.dto.js";
import { UpdatePeriodSlotDto } from "./dto/update-period-slot.dto.js";
import { TimetableService } from "./timetable.service.js";

@Controller("timetable/period-slots")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class PeriodSlotsController {
  constructor(private readonly timetableService: TimetableService) {}

  @Get()
  @RequirePermission("timetable.view")
  list(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("academic_session_id") academicSessionId: string,
  ) {
    return this.timetableService.listPeriodSlots(user.tenant_id, branchId, academicSessionId);
  }

  @Post()
  @RequirePermission("timetable.manage")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePeriodSlotDto) {
    return this.timetableService.createPeriodSlot(user.tenant_id, user.sub, dto);
  }

  @Patch(":id")
  @RequirePermission("timetable.manage")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdatePeriodSlotDto) {
    return this.timetableService.updatePeriodSlot(user.tenant_id, user.sub, id, dto, user.branch_id);
  }

  @Delete(":id")
  @RequirePermission("timetable.manage")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.timetableService.deletePeriodSlot(user.tenant_id, user.sub, id, user.branch_id);
  }
}

// No @RequirePermission on the GET/PUT handlers -- authorization is
// additive (timetable.view/manage OR being the section's class teacher),
// same pattern as AttendanceController, checked explicitly via
// TimetableService.assertCanView.
@Controller("timetable/sections")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class SectionTimetableController {
  constructor(
    private readonly timetableService: TimetableService,
    private readonly scopedAccess: ScopedAccessService,
  ) {}

  @Get(":sectionId")
  async get(
    @CurrentUser() user: JwtPayload,
    @Param("sectionId") sectionId: string,
    @Query("academic_session_id") academicSessionId: string,
  ) {
    await this.timetableService.assertCanView(user.tenant_id, user.sub, sectionId);
    return this.timetableService.getSectionTimetable(user.tenant_id, sectionId, academicSessionId, user.branch_id);
  }

  @Put(":sectionId")
  @RequirePermission("timetable.manage")
  save(
    @CurrentUser() user: JwtPayload,
    @Param("sectionId") sectionId: string,
    @Body() dto: SaveSectionTimetableDto,
  ) {
    return this.timetableService.saveSectionTimetable(user.tenant_id, user.sub, sectionId, dto, user.branch_id);
  }
}

@Controller("timetable/staff")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class StaffTimetableController {
  constructor(
    private readonly timetableService: TimetableService,
    private readonly scopedAccess: ScopedAccessService,
  ) {}

  // Additive: timetable.view OR staff.view OR the requester is that staff
  // member themselves.
  @Get(":staffId")
  async get(
    @CurrentUser() user: JwtPayload,
    @Param("staffId") staffId: string,
    @Query("academic_session_id") academicSessionId: string,
  ) {
    const allowed =
      (await this.scopedAccess.hasPermission(user.tenant_id, user.sub, "timetable.view")) ||
      (await this.scopedAccess.hasPermission(user.tenant_id, user.sub, "staff.view")) ||
      (await this.scopedAccess.getActingStaff(user.tenant_id, user.sub))?.id === staffId;
    if (!allowed) {
      throw new ForbiddenException("not authorized to view this staff member's timetable");
    }
    return this.timetableService.getStaffTimetable(user.tenant_id, staffId, academicSessionId, user.branch_id);
  }
}

@Controller("timetable")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class MyTimetableController {
  constructor(
    private readonly timetableService: TimetableService,
    private readonly scopedAccess: ScopedAccessService,
  ) {}

  @Get("me")
  async getMine(@CurrentUser() user: JwtPayload, @Query("academic_session_id") academicSessionId: string) {
    const staff = await this.scopedAccess.getActingStaff(user.tenant_id, user.sub);
    if (!staff) {
      throw new ForbiddenException("your account isn't linked to a staff record");
    }
    return this.timetableService.getStaffTimetable(user.tenant_id, staff.id, academicSessionId, user.branch_id);
  }
}
