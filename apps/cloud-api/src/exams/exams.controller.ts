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
  list(@Query("branch_id") branchId: string, @Query("class_id") classId?: string) {
    return this.examsService.listExams(branchId, classId);
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

  @Get(":examId/subjects/:subjectId/marks-roster")
  @RequirePermission("exams.enter_marks")
  marksRoster(@Param("examId") examId: string, @Param("subjectId") subjectId: string) {
    return this.examsService.getMarksRoster(examId, subjectId);
  }

  @Post("marks")
  @RequirePermission("exams.enter_marks")
  saveMarks(@CurrentUser() user: JwtPayload, @Body() dto: SaveMarksDto) {
    return this.examsService.saveMarks(user.tenant_id, user.sub, dto);
  }

  @Get("report-card")
  @RequirePermission("exams.view")
  reportCard(@Query("student_id") studentId: string, @Query("exam_id") examId: string) {
    return this.examsService.getReportCard(studentId, examId);
  }
}
