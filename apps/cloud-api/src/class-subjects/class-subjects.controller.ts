import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { ClassSubjectsService } from "./class-subjects.service.js";
import { AddElectiveGroupMemberDto } from "./dto/add-elective-group-member.dto.js";
import { CreateClassSubjectDto } from "./dto/create-class-subject.dto.js";
import { CreateElectiveGroupDto } from "./dto/create-elective-group.dto.js";

@Controller("classes/:classId/subjects")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class ClassSubjectsController {
  constructor(private readonly classSubjectsService: ClassSubjectsService) {}

  @Get()
  @RequirePermission("exams.view")
  list(@CurrentUser() user: JwtPayload, @Param("classId") classId: string) {
    return this.classSubjectsService.listClassSubjects(user.tenant_id, classId);
  }

  @Post()
  @RequirePermission("exams.manage_subjects")
  create(@CurrentUser() user: JwtPayload, @Param("classId") classId: string, @Body() dto: CreateClassSubjectDto) {
    return this.classSubjectsService.addClassSubject(user.tenant_id, user.sub, classId, dto, user.branch_id);
  }
}

@Controller("class-subjects")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class ClassSubjectItemController {
  constructor(private readonly classSubjectsService: ClassSubjectsService) {}

  @Delete(":id")
  @RequirePermission("exams.manage_subjects")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.classSubjectsService.removeClassSubject(user.tenant_id, user.sub, id, user.branch_id);
  }
}

@Controller("classes/:classId/elective-groups")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class ClassElectiveGroupsController {
  constructor(private readonly classSubjectsService: ClassSubjectsService) {}

  @Get()
  @RequirePermission("exams.view")
  list(@CurrentUser() user: JwtPayload, @Param("classId") classId: string) {
    return this.classSubjectsService.listElectiveGroups(user.tenant_id, classId);
  }

  @Post()
  @RequirePermission("exams.manage_subjects")
  create(@CurrentUser() user: JwtPayload, @Param("classId") classId: string, @Body() dto: CreateElectiveGroupDto) {
    return this.classSubjectsService.createElectiveGroup(user.tenant_id, user.sub, classId, dto, user.branch_id);
  }
}

@Controller("elective-groups")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class ElectiveGroupsController {
  constructor(private readonly classSubjectsService: ClassSubjectsService) {}

  @Post(":id/members")
  @RequirePermission("exams.manage_subjects")
  addMember(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: AddElectiveGroupMemberDto) {
    return this.classSubjectsService.addElectiveGroupMember(user.tenant_id, user.sub, id, dto, user.branch_id);
  }

  @Delete(":id/members/:classSubjectId")
  @RequirePermission("exams.manage_subjects")
  removeMember(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("classSubjectId") classSubjectId: string,
  ) {
    return this.classSubjectsService.removeElectiveGroupMember(user.tenant_id, user.sub, id, classSubjectId, user.branch_id);
  }

  @Delete(":id")
  @RequirePermission("exams.manage_subjects")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.classSubjectsService.deleteElectiveGroup(user.tenant_id, user.sub, id, user.branch_id);
  }
}
