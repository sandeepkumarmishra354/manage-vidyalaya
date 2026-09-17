import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CreateExamDto } from "./dto/create-exam.dto.js";
import { CreateSubjectDto } from "./dto/create-subject.dto.js";
import { SaveMarksDto } from "./dto/save-marks.dto.js";
import { UpdateExamDto } from "./dto/update-exam.dto.js";
import { UpdateSubjectDto } from "./dto/update-subject.dto.js";
import { ExamsService } from "./exams.service.js";

@Controller("subjects")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SubjectsController {
  constructor(private readonly examsService: ExamsService) {}

  @Get()
  @RequirePermission("exams.view")
  list(@Query("branch_id") branchId: string) {
    return this.examsService.listSubjects(branchId);
  }

  @Post()
  @RequirePermission("exams.manage_subjects")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSubjectDto) {
    return this.examsService.createSubject(user.tenant_id, dto);
  }

  @Patch(":id")
  @RequirePermission("exams.manage_subjects")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateSubjectDto) {
    return this.examsService.updateSubject(user.tenant_id, user.sub, id, dto);
  }
}

@Controller("exams")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Get()
  @RequirePermission("exams.view")
  list(
    @Query("branch_id") branchId: string,
    @Query("class_id") classId?: string,
    @Query("academic_session_id") academicSessionId?: string,
  ) {
    return this.examsService.listExams(branchId, classId, academicSessionId);
  }

  @Post()
  @RequirePermission("exams.manage_exams")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateExamDto) {
    return this.examsService.createExam(user.tenant_id, dto);
  }

  @Patch(":id")
  @RequirePermission("exams.manage_exams")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateExamDto) {
    return this.examsService.updateExam(user.tenant_id, user.sub, id, dto);
  }

  @Get(":examId/subjects/:subjectId/pending-backpaper")
  @RequirePermission("exams.manage_exams")
  pendingBackpaper(@Param("examId") examId: string, @Param("subjectId") subjectId: string) {
    return this.examsService.listStudentsPendingBackpaper(examId, subjectId);
  }

  // No @RequirePermission -- authorization is additive (exams.enter_marks
  // OR being assigned to teach this class+subject+session), which
  // PermissionsGuard's flat model can't express. ExamsService checks
  // explicitly via resolveMarksEntryAccess instead.
  @Get(":examId/subjects/:subjectId/marks-roster")
  marksRoster(@CurrentUser() user: JwtPayload, @Param("examId") examId: string, @Param("subjectId") subjectId: string) {
    return this.examsService.getMarksRoster(user.tenant_id, user.sub, examId, subjectId);
  }

  @Post("marks")
  saveMarks(@CurrentUser() user: JwtPayload, @Body() dto: SaveMarksDto) {
    return this.examsService.saveMarks(user.tenant_id, user.sub, dto);
  }

  // Open to any authenticated user -- just returns the caller's own
  // teaching assignments for this exam's class+session, so the frontend can
  // restrict a non-broad-permission teacher's subject dropdown.
  @Get(":examId/my-teaching-assignments")
  myTeachingAssignments(@CurrentUser() user: JwtPayload, @Param("examId") examId: string) {
    return this.examsService.getMyTeachingAssignments(user.tenant_id, user.sub, examId);
  }

  @Get("report-card")
  @RequirePermission("exams.view")
  reportCard(@Query("student_id") studentId: string, @Query("exam_id") examId: string) {
    return this.examsService.getReportCard(studentId, examId);
  }

  @Get(":id/submission-status")
  @RequirePermission("exams.view")
  submissionStatus(@Param("id") id: string) {
    return this.examsService.getSubmissionStatus(id);
  }

  @Post(":id/publish-results")
  @RequirePermission("exams.manage_exams")
  publishResults(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.examsService.publishExamResults(user.tenant_id, user.sub, id);
  }

  @Post(":id/reopen-results")
  @RequirePermission("exams.manage_exams")
  reopenResults(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.examsService.reopenExamResults(user.tenant_id, user.sub, id);
  }
}
