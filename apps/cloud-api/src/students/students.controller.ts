import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { AddGuardianDto } from "./dto/add-guardian.dto.js";
import { CreateAdmissionDto } from "./dto/create-admission.dto.js";
import { ElectSubjectDto } from "./dto/elect-subject.dto.js";
import { UpdateGuardianDto } from "./dto/update-guardian.dto.js";
import { UpdateStudentDto } from "./dto/update-student.dto.js";
import { StudentsService } from "./students.service.js";

@Controller("students")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @RequirePermission("students.view")
  list(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string, @Query("search") search?: string) {
    return this.studentsService.listStudents(user.tenant_id, branchId, search);
  }

  @Get("in-class/:classId")
  @RequirePermission("students.view")
  listInClass(@Param("classId") classId: string) {
    return this.studentsService.listStudentsInClass(classId);
  }

  @Get(":id")
  @RequirePermission("students.view")
  get(@Param("id") id: string) {
    return this.studentsService.getStudent(id);
  }

  @Patch(":id")
  @RequirePermission("students.edit")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateStudentDto) {
    return this.studentsService.updateStudent(user.tenant_id, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermission("students.delete")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.studentsService.deleteStudent(user.tenant_id, user.sub, id);
  }

  @Get(":id/siblings")
  @RequirePermission("students.view")
  siblings(@Param("id") id: string) {
    return this.studentsService.getSiblings(id);
  }

  @Post(":id/guardians")
  @RequirePermission("students.edit")
  addGuardian(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: AddGuardianDto) {
    return this.studentsService.addGuardianToStudent(user.tenant_id, user.sub, id, dto);
  }

  @Get(":id/electives")
  @RequirePermission("students.view")
  listElectives(@Param("id") id: string, @Query("academic_session_id") academicSessionId?: string) {
    return this.studentsService.listElectiveChoices(id, academicSessionId);
  }

  @Post(":id/electives")
  @RequirePermission("students.edit")
  elect(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: ElectSubjectDto) {
    return this.studentsService.electSubject(user.tenant_id, user.sub, id, dto);
  }
}

@Controller("guardians")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GuardiansController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @RequirePermission("students.view")
  search(@CurrentUser() user: JwtPayload, @Query("search") search: string) {
    return this.studentsService.searchGuardians(user.tenant_id, search);
  }

  @Get(":id")
  @RequirePermission("students.view")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.studentsService.getGuardian(user.tenant_id, id);
  }

  @Patch(":id")
  @RequirePermission("students.edit")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateGuardianDto) {
    return this.studentsService.updateGuardian(user.tenant_id, user.sub, id, dto);
  }
}

@Controller("admissions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdmissionsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @RequirePermission("admissions.create")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAdmissionDto) {
    return this.studentsService.createAdmission(user.tenant_id, user.sub, dto);
  }

  @Get("student/:studentId")
  forStudent(@Param("studentId") studentId: string) {
    return this.studentsService.getAdmissionForStudent(studentId);
  }

  @Post(":id/confirm")
  @RequirePermission("admissions.confirm")
  confirm(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.studentsService.confirmAdmission(user.tenant_id, user.sub, id);
  }
}
