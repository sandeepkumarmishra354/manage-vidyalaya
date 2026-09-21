import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/current-user.decorator.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { AcademicService } from "./academic.service.js";
import { CreateAcademicSessionDto } from "./dto/create-academic-session.dto.js";
import { CreateClassDto } from "./dto/create-class.dto.js";
import { CreateSectionDto } from "./dto/create-section.dto.js";
import { UpdateAcademicSessionDto } from "./dto/update-academic-session.dto.js";
import { UpdateBranchDto } from "./dto/update-branch.dto.js";
import { UpdateClassDto } from "./dto/update-class.dto.js";
import { UpdateSectionDto } from "./dto/update-section.dto.js";

// PermissionsGuard no-ops when a handler has no @RequirePermission metadata
// (see PermissionsGuard.canActivate), so GET stays open to any
// authenticated user exactly as before -- only PATCH is gated. Every list()
// below (branches, academic-sessions, classes, sections) follows the same
// shape: this is basic reference data -- which session is current, what
// classes/sections exist -- that virtually every feature needs just to
// resolve context (e.g. a teacher's own timetable/marks-entry screens
// looking up "the current session"), not something specific to the
// Academic Setup admin screens that `academic_setup.*` otherwise gates.
// Gating list() the same as the write endpoints would block a user who
// legitimately holds e.g. `timetable.view` or `exams.enter_marks` but not
// `academic_setup.view` from using features that have nothing to do with
// academic setup administration.
@Controller("branches")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class BranchesController {
  constructor(private readonly academicService: AcademicService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.academicService.listBranches(user.tenant_id);
  }

  @Patch(":id")
  @RequirePermission("academic_setup.manage_school_details")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateBranchDto) {
    return this.academicService.updateBranch(user.tenant_id, user.sub, id, dto, user.branch_id);
  }
}

@Controller("academic-sessions")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class AcademicSessionsController {
  constructor(private readonly academicService: AcademicService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.academicService.listAcademicSessions(user.tenant_id);
  }

  @Post()
  @RequirePermission("academic_setup.manage_sessions")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAcademicSessionDto) {
    return this.academicService.createAcademicSession(user.tenant_id, user.sub, dto);
  }

  @Patch(":id")
  @RequirePermission("academic_setup.manage_sessions")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateAcademicSessionDto) {
    return this.academicService.updateAcademicSession(user.tenant_id, user.sub, id, dto);
  }
}

@Controller("classes")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class ClassesController {
  constructor(private readonly academicService: AcademicService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string) {
    return this.academicService.listClasses(user.tenant_id, branchId);
  }

  @Post()
  @RequirePermission("academic_setup.manage_classes")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateClassDto) {
    return this.academicService.createClass(user.tenant_id, user.sub, dto);
  }

  @Patch(":id")
  @RequirePermission("academic_setup.manage_classes")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateClassDto) {
    return this.academicService.updateClass(user.tenant_id, user.sub, id, dto, user.branch_id);
  }

  @Delete(":id")
  @RequirePermission("academic_setup.manage_classes")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.academicService.deleteClass(user.tenant_id, user.sub, id, user.branch_id);
  }
}

@Controller("sections")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class SectionsController {
  constructor(private readonly academicService: AcademicService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("class_id") classId: string) {
    return this.academicService.listSections(user.tenant_id, classId);
  }

  @Post()
  @RequirePermission("academic_setup.manage_sections")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSectionDto) {
    return this.academicService.createSection(user.tenant_id, user.sub, dto);
  }

  @Patch(":id")
  @RequirePermission("academic_setup.manage_sections")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateSectionDto) {
    return this.academicService.updateSection(user.tenant_id, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermission("academic_setup.manage_sections")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.academicService.deleteSection(user.tenant_id, user.sub, id);
  }
}
