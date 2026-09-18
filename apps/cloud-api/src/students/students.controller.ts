import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { AddGuardianDto } from "./dto/add-guardian.dto.js";
import { CreateAdmissionDto } from "./dto/create-admission.dto.js";
import { ElectSubjectDto } from "./dto/elect-subject.dto.js";
import { IssueTransferCertificateDto } from "./dto/issue-transfer-certificate.dto.js";
import { SetPhotoDto } from "./dto/set-photo.dto.js";
import { UpdateGuardianDto } from "./dto/update-guardian.dto.js";
import { UpdateStudentDto } from "./dto/update-student.dto.js";
import { StudentsService } from "./students.service.js";

@Controller("students")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @RequirePermission("students.view")
  list(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("class_id") classId?: string,
    @Query("section_id") sectionId?: string,
    @Query("gender") gender?: string,
  ) {
    return this.studentsService.listStudents(user.tenant_id, branchId, search, { status, classId, sectionId, gender });
  }

  @Get("in-class/:classId")
  @RequirePermission("students.view")
  listInClass(@CurrentUser() user: JwtPayload, @Param("classId") classId: string) {
    return this.studentsService.listStudentsInClass(user.tenant_id, classId);
  }

  // Must be registered before :id so "qr-codes"/"photo-urls" aren't
  // swallowed as an id.
  @Get("qr-codes")
  @RequirePermission("students.view")
  getQrCodesBulk(@CurrentUser() user: JwtPayload, @Query("ids") ids: string) {
    return this.studentsService.getQrCodesBulk(
      user.tenant_id,
      ids
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }

  @Get("photo-urls")
  @RequirePermission("students.view")
  getPhotoUrlsBulk(@CurrentUser() user: JwtPayload, @Query("ids") ids: string) {
    return this.studentsService.getPhotoUrlsBulk(
      user.tenant_id,
      ids
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }

  @Get(":id")
  @RequirePermission("students.view")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.studentsService.getStudent(user.tenant_id, id);
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
  siblings(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.studentsService.getSiblings(user.tenant_id, id);
  }

  @Post(":id/guardians")
  @RequirePermission("students.edit")
  addGuardian(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: AddGuardianDto) {
    return this.studentsService.addGuardianToStudent(user.tenant_id, user.sub, id, dto);
  }

  @Get(":id/electives")
  @RequirePermission("students.view")
  listElectives(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Query("academic_session_id") academicSessionId?: string,
  ) {
    return this.studentsService.listElectiveChoices(user.tenant_id, id, academicSessionId);
  }

  @Post(":id/electives")
  @RequirePermission("students.edit")
  elect(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: ElectSubjectDto) {
    return this.studentsService.electSubject(user.tenant_id, user.sub, id, dto);
  }

  @Get(":id/transfer-certificate")
  @RequirePermission("students.view")
  getTransferCertificate(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.studentsService.getTransferCertificate(user.tenant_id, id);
  }

  @Post(":id/transfer-certificate")
  @RequirePermission("students.edit")
  issueTransferCertificate(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: IssueTransferCertificateDto,
  ) {
    return this.studentsService.issueTransferCertificate(user.tenant_id, user.sub, id, dto);
  }

  @Get(":id/qr-code")
  @RequirePermission("students.view")
  getQrCode(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.studentsService.getQrCode(user.tenant_id, id);
  }

  @Post(":id/qr-code/reissue")
  @RequirePermission("students.edit")
  reissueQrCode(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.studentsService.reissueQrCode(user.tenant_id, user.sub, id);
  }

  @Get(":id/photo/upload-url")
  @RequirePermission("students.edit")
  getPhotoUploadUrl(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Query("file_name") fileName: string,
    @Query("content_type") contentType: string,
  ) {
    return this.studentsService.getPhotoUploadUrl(user.tenant_id, id, fileName, contentType);
  }

  @Patch(":id/photo")
  @RequirePermission("students.edit")
  setPhoto(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: SetPhotoDto) {
    return this.studentsService.setPhoto(user.tenant_id, user.sub, id, dto.storage_key);
  }

  @Get(":id/photo-url")
  @RequirePermission("students.view")
  getPhotoUrl(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.studentsService.getPhotoUrl(user.tenant_id, id);
  }

  @Delete(":id/photo")
  @RequirePermission("students.edit")
  deletePhoto(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.studentsService.deletePhoto(user.tenant_id, user.sub, id);
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
  forStudent(@CurrentUser() user: JwtPayload, @Param("studentId") studentId: string) {
    return this.studentsService.getAdmissionForStudent(user.tenant_id, studentId);
  }

  @Post(":id/confirm")
  @RequirePermission("admissions.confirm")
  confirm(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.studentsService.confirmAdmission(user.tenant_id, user.sub, id);
  }
}
