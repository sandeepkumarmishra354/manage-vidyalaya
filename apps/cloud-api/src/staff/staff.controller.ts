import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CreateStaffDto } from "./dto/create-staff.dto.js";
import { CreateTeacherAssignmentDto } from "./dto/create-teacher-assignment.dto.js";
import { IssueExperienceLetterDto } from "./dto/issue-experience-letter.dto.js";
import { SetClassTeacherDto } from "./dto/set-class-teacher.dto.js";
import { SetPhotoDto } from "./dto/set-photo.dto.js";
import { SetStaffStatusDto } from "./dto/set-staff-status.dto.js";
import { UpdateStaffDto } from "./dto/update-staff.dto.js";
import { StaffService } from "./staff.service.js";

@Controller("staff")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @RequirePermission("staff.view")
  list(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("search") search?: string,
    @Query("category_id") categoryId?: string,
    @Query("department") department?: string,
    @Query("status") status?: string,
  ) {
    return this.staffService.listStaff(user.tenant_id, branchId, search, { categoryId, department, status });
  }

  // No @RequirePermission -- resolving a signature to render on a printed
  // document is non-sensitive and needed broadly (e.g. any teacher
  // printing their own class's register), not just staff.view holders.
  // Must be registered before :id so "principal" isn't swallowed as an id.
  @Get("principal")
  getPrincipalSignature(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string) {
    return this.staffService.getPrincipalSignature(user.tenant_id, branchId);
  }

  // Must be registered before :id so "qr-codes"/"photo-urls" aren't
  // swallowed as an id.
  @Get("qr-codes")
  @RequirePermission("staff.view")
  getQrCodesBulk(@CurrentUser() user: JwtPayload, @Query("ids") ids: string) {
    return this.staffService.getQrCodesBulk(
      user.tenant_id,
      ids
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }

  @Get("photo-urls")
  @RequirePermission("staff.view")
  getPhotoUrlsBulk(@CurrentUser() user: JwtPayload, @Query("ids") ids: string) {
    return this.staffService.getPhotoUrlsBulk(
      user.tenant_id,
      ids
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }

  @Get(":id")
  @RequirePermission("staff.view")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.staffService.getStaff(user.tenant_id, id);
  }

  @Get(":id/signature")
  getSignature(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.staffService.getStaffSignature(user.tenant_id, id);
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

  @Get(":id/experience-letter")
  @RequirePermission("staff.view")
  getExperienceLetter(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.staffService.getExperienceLetter(user.tenant_id, id);
  }

  @Post(":id/experience-letter")
  @RequirePermission("staff.manage_profile")
  issueExperienceLetter(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: IssueExperienceLetterDto) {
    return this.staffService.issueExperienceLetter(user.tenant_id, user.sub, id, dto);
  }

  @Get(":id/qr-code")
  @RequirePermission("staff.view")
  getQrCode(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.staffService.getQrCode(user.tenant_id, id);
  }

  @Post(":id/qr-code/reissue")
  @RequirePermission("staff.manage_profile")
  reissueQrCode(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.staffService.reissueQrCode(user.tenant_id, user.sub, id);
  }

  @Get(":id/photo/upload-url")
  @RequirePermission("staff.manage_profile")
  getPhotoUploadUrl(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Query("file_name") fileName: string,
    @Query("content_type") contentType: string,
  ) {
    return this.staffService.getPhotoUploadUrl(user.tenant_id, id, fileName, contentType);
  }

  @Patch(":id/photo")
  @RequirePermission("staff.manage_profile")
  setPhoto(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: SetPhotoDto) {
    return this.staffService.setPhoto(user.tenant_id, user.sub, id, dto.storage_key);
  }

  @Get(":id/photo-url")
  @RequirePermission("staff.view")
  getPhotoUrl(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.staffService.getPhotoUrl(user.tenant_id, id);
  }

  @Delete(":id/photo")
  @RequirePermission("staff.manage_profile")
  deletePhoto(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.staffService.deletePhoto(user.tenant_id, user.sub, id);
  }
}

@Controller("teacher-assignments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TeacherAssignmentsController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @RequirePermission("staff.view")
  list(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string, @Query("staff_id") staffId?: string) {
    return this.staffService.listTeacherAssignments(user.tenant_id, branchId, staffId);
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
