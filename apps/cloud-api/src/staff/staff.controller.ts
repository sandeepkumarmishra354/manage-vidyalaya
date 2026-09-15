import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CreateStaffDto } from "./dto/create-staff.dto.js";
import { CreateTeacherAssignmentDto } from "./dto/create-teacher-assignment.dto.js";
import { SetClassTeacherDto } from "./dto/set-class-teacher.dto.js";
import { SetStaffStatusDto } from "./dto/set-staff-status.dto.js";
import { UpdateStaffDto } from "./dto/update-staff.dto.js";
import { StaffService } from "./staff.service.js";

@Controller("staff")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @RequirePermission("staff.view")
  list(@Query("branch_id") branchId: string, @Query("search") search?: string) {
    return this.staffService.listStaff(branchId, search);
  }

  @Get(":id")
  @RequirePermission("staff.view")
  get(@Param("id") id: string) {
    return this.staffService.getStaff(id);
  }

  @Post()
  @RequirePermission("staff.manage_profile")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateStaffDto) {
    return this.staffService.createStaff(user.tenant_id, user.sub, dto);
  }

  @Patch(":id")
  @RequirePermission("staff.manage_profile")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateStaffDto) {
    return this.staffService.updateStaff(user.tenant_id, user.sub, id, dto);
  }

  @Post(":id/status")
  @RequirePermission("staff.manage_profile")
  setStatus(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: SetStaffStatusDto) {
    return this.staffService.setStaffStatus(user.tenant_id, user.sub, id, dto);
  }
}

@Controller("teacher-assignments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TeacherAssignmentsController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @RequirePermission("staff.view")
  list(@Query("branch_id") branchId: string, @Query("staff_id") staffId?: string) {
    return this.staffService.listTeacherAssignments(branchId, staffId);
  }

  @Post()
  @RequirePermission("staff.manage_assignments")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTeacherAssignmentDto) {
    return this.staffService.createTeacherAssignment(user.tenant_id, user.sub, dto);
  }

  @Delete(":id")
  @RequirePermission("staff.manage_assignments")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.staffService.deleteTeacherAssignment(user.tenant_id, user.sub, id);
  }
}

// Owns just the class-teacher assignment on a section -- gated by
// staff.manage_assignments (a staffing decision), unlike the rest of
// /sections's CRUD in AcademicModule which is gated by academic_setup keys.
@Controller("sections")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SectionClassTeacherController {
  constructor(private readonly staffService: StaffService) {}

  @Patch(":sectionId/class-teacher")
  @RequirePermission("staff.manage_assignments")
  setClassTeacher(@CurrentUser() user: JwtPayload, @Param("sectionId") sectionId: string, @Body() dto: SetClassTeacherDto) {
    return this.staffService.setClassTeacher(user.tenant_id, user.sub, sectionId, dto);
  }
}
