import { randomUUID } from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { ClassSubjectsService } from "../class-subjects/class-subjects.service.js";
import { ScopedAccessService } from "../common/scoped-access.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateExamDto } from "./dto/create-exam.dto.js";
import type { CreateSubjectDto } from "./dto/create-subject.dto.js";
import type { SaveMarksDto } from "./dto/save-marks.dto.js";
import type { UpdateExamDto } from "./dto/update-exam.dto.js";
import type { UpdateSubjectDto } from "./dto/update-subject.dto.js";

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopedAccess: ScopedAccessService,
    private readonly classSubjects: ClassSubjectsService,
  ) {}

  listSubjects(branchId: string) {
    return this.prisma.subject.findMany({
      where: { branchId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async createSubject(tenantId: string, dto: CreateSubjectDto) {
    return this.prisma.subject.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: dto.branch_id,
        name: dto.name,
        code: dto.code ?? null,
        updatedAt: new Date(),
      },
    });
  }

  async updateSubject(tenantId: string, actorUserId: string, id: string, dto: UpdateSubjectDto) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subject.update({
        where: { id },
        data: { name: dto.name, code: dto.code ?? null, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });
      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "subjects",
        entityId: id,
        action: "update",
        summary: `Renamed subject to '${dto.name}'`,
      });
      return updated;
    });
  }

  listExams(branchId: string, classId?: string) {
    return this.prisma.exam.findMany({
      where: { branchId, deletedAt: null, ...(classId ? { classId } : {}) },
      orderBy: [{ examDate: "desc" }, { name: "asc" }],
    });
  }

  async createExam(tenantId: string, dto: CreateExamDto) {
    return this.prisma.exam.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: dto.branch_id,
        academicSessionId: dto.academic_session_id,
        classId: dto.class_id,
        name: dto.name,
        examDate: dto.exam_date ? new Date(dto.exam_date) : null,
        examType: dto.exam_type ?? "regular",
        parentExamId: dto.parent_exam_id ?? null,
        passingPercentage: dto.passing_percentage ?? 33.0,
        updatedAt: new Date(),
      },
    });
  }

  async updateExam(tenantId: string, actorUserId: string, id: string, dto: UpdateExamDto) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exam.update({
        where: { id },
        data: {
          name: dto.name,
          examDate: dto.exam_date ? new Date(dto.exam_date) : null,
          passingPercentage: dto.passing_percentage,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });
      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "exams",
        entityId: id,
        action: "update",
        summary: `Updated exam '${dto.name}'`,
      });
      return updated;
    });
  }

  // Students who failed (or were absent for) a subject on this exam -- the
  // roster to pre-fill when creating a back-paper exam for that exam+subject.
  async listStudentsPendingBackpaper(examId: string, subjectId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      throw new NotFoundException("exam not found");
    }

    const marks = await this.prisma.examMark.findMany({
      where: { examId, subjectId, deletedAt: null },
      include: { student: true },
    });

    return marks
      .filter(
        (m) =>
          m.isAbsent || (m.marksObtained !== null && m.marksObtained < (m.maxMarks * exam.passingPercentage) / 100.0),
      )
      .sort((a, b) => a.student.firstName.localeCompare(b.student.firstName))
      .map((m) => ({
        student_id: m.studentId,
        first_name: m.student.firstName,
        last_name: m.student.lastName,
        marks_obtained: m.marksObtained,
        max_marks: m.maxMarks,
      }));
  }

  // Additive: exams.enter_marks holders can enter marks for any subject on
  // this exam, as today. On top of that, a staff member with a matching
  // TeacherSubjectAssignment (same class + subject + academic session) can
  // enter marks for just that subject without the broad permission. When
  // their assignment is section-scoped (not the "any section" sectionId:
  // null convention), the returned sectionId narrows the roster/edits to
  // that section only.
  private async resolveMarksEntryAccess(tenantId: string, userId: string, examId: string, subjectId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      throw new NotFoundException("exam not found");
    }

    if (await this.scopedAccess.hasPermission(userId, "exams.enter_marks")) {
      return { exam, sectionId: null as string | null };
    }

    const staff = await this.scopedAccess.getActingStaff(tenantId, userId);
    if (staff) {
      const assignment = await this.prisma.teacherSubjectAssignment.findFirst({
        where: {
          staffId: staff.id,
          classId: exam.classId,
          subjectId,
          academicSessionId: exam.academicSessionId,
          deletedAt: null,
        },
      });
      if (assignment) {
        return { exam, sectionId: assignment.sectionId };
      }
    }

    throw new ForbiddenException("not authorized to enter marks for this subject");
  }

  // Every subject a staff member is assigned to teach for this exam's
  // class+session, regardless of whether they hold the broad
  // exams.enter_marks permission -- lets the frontend restrict a
  // non-broad-permission teacher's subject dropdown to their own subjects.
  async getMyTeachingAssignments(tenantId: string, userId: string, examId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      throw new NotFoundException("exam not found");
    }

    const staff = await this.scopedAccess.getActingStaff(tenantId, userId);
    if (!staff) {
      return [];
    }

    const assignments = await this.prisma.teacherSubjectAssignment.findMany({
      where: { staffId: staff.id, classId: exam.classId, academicSessionId: exam.academicSessionId, deletedAt: null },
      include: { subject: true },
    });

    const bySubject = new Map<string, { subject_id: string; subject_name: string }>();
    for (const a of assignments) {
      bySubject.set(a.subjectId, { subject_id: a.subjectId, subject_name: a.subject.name });
    }
    return Array.from(bySubject.values());
  }

  // Every enrolled student in the exam's class (narrowed to the caller's
  // assigned section, if their marks-entry access is section-scoped), with
  // whatever marks already exist for this exam+subject, so the UI can
  // render a marks-entry roster in one call.
  async getMarksRoster(tenantId: string, userId: string, examId: string, subjectId: string) {
    const { exam, sectionId } = await this.resolveMarksEntryAccess(tenantId, userId, examId, subjectId);

    const students = await this.prisma.student.findMany({
      where: {
        currentClassId: exam.classId,
        deletedAt: null,
        status: "enrolled",
        ...(sectionId ? { currentSectionId: sectionId } : {}),
      },
      orderBy: { firstName: "asc" },
    });

    const marks = await this.prisma.examMark.findMany({
      where: { examId, subjectId, studentId: { in: students.map((s) => s.id) }, deletedAt: null },
    });
    const markByStudent = new Map(marks.map((m) => [m.studentId, m]));

    return students.map((s) => {
      const mark = markByStudent.get(s.id);
      return {
        student_id: s.id,
        first_name: s.firstName,
        last_name: s.lastName,
        max_marks: mark?.maxMarks ?? 100,
        marks_obtained: mark?.marksObtained ?? null,
        is_absent: mark?.isAbsent ?? false,
        result: mark?.result ?? null,
      };
    });
  }

  // Auto-computes pass/fail/grace from marks vs. the exam's passing
  // percentage (absent always fails), unless the entry carries an explicit
  // override_result -- an override always wins. Returns null (no result
  // yet) when marks haven't actually been entered.
  private computeResult(
    entry: { marks_obtained?: number | null; max_marks: number; is_absent: boolean; override_result?: "pass" | "fail" | "grace" | null },
    passingPercentage: number,
  ): "pass" | "fail" | "grace" | null {
    if (entry.override_result) {
      return entry.override_result;
    }
    if (entry.is_absent) {
      return "fail";
    }
    if (entry.marks_obtained === null || entry.marks_obtained === undefined) {
      return null;
    }
    const percentage = (entry.marks_obtained / entry.max_marks) * 100;
    return percentage >= passingPercentage ? "pass" : "fail";
  }

  async saveMarks(tenantId: string, actorUserId: string, dto: SaveMarksDto) {
    const { exam, sectionId } = await this.resolveMarksEntryAccess(tenantId, actorUserId, dto.exam_id, dto.subject_id);

    if (exam.resultsPublishedAt) {
      throw new BadRequestException("results have been published for this exam; reopen results before editing marks");
    }

    if (sectionId) {
      const students = await this.prisma.student.findMany({
        where: { id: { in: dto.entries.map((e) => e.student_id) } },
        select: { id: true, currentSectionId: true },
      });
      const outsideSection = students.some((s) => s.currentSectionId !== sectionId);
      if (outsideSection) {
        throw new ForbiddenException("not authorized to enter marks for students outside your assigned section");
      }
    }

    const now = new Date();

    await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.examMark.upsert({
          where: {
            examId_subjectId_studentId: {
              examId: dto.exam_id,
              subjectId: dto.subject_id,
              studentId: entry.student_id,
            },
          },
          create: {
            id: randomUUID(),
            tenantId,
            examId: dto.exam_id,
            subjectId: dto.subject_id,
            studentId: entry.student_id,
            maxMarks: entry.max_marks,
            marksObtained: entry.marks_obtained ?? null,
            isAbsent: entry.is_absent,
            result: this.computeResult(entry, exam.passingPercentage),
            updatedAt: now,
            updatedBy: actorUserId,
          },
          update: {
            maxMarks: entry.max_marks,
            marksObtained: entry.marks_obtained ?? null,
            isAbsent: entry.is_absent,
            result: this.computeResult(entry, exam.passingPercentage),
            updatedAt: now,
            updatedBy: actorUserId,
            version: { increment: 1 },
          },
        }),
      ),
    );
  }

  async getReportCard(studentId: string, examId: string) {
    const [student, exam] = await Promise.all([
      this.prisma.student.findUniqueOrThrow({
        where: { id: studentId },
        include: {
          currentClass: true,
          currentSection: true,
          studentGuardians: { include: { guardian: true } },
        },
      }),
      this.prisma.exam.findUniqueOrThrow({ where: { id: examId } }),
    ]);

    const marks = await this.prisma.examMark.findMany({
      where: { examId, studentId, deletedAt: null },
      include: { subject: true },
      orderBy: { subject: { name: "asc" } },
    });

    // For each subject, check whether a back-paper exam linked to this one
    // (exams.parent_exam_id = examId) has marks for the same student --
    // shown alongside the original attempt rather than replacing it.
    const rows = await Promise.all(
      marks.map(async (m) => {
        const backpaperMark = await this.prisma.examMark.findFirst({
          where: {
            subjectId: m.subjectId,
            studentId,
            deletedAt: null,
            exam: { parentExamId: examId },
          },
          orderBy: { exam: { examDate: "desc" } },
        });

        return {
          subject_name: m.subject.name,
          max_marks: m.maxMarks,
          marks_obtained: m.marksObtained,
          is_absent: m.isAbsent,
          result: m.result,
          backpaper_marks_obtained: backpaperMark?.marksObtained ?? null,
        };
      }),
    );

    const totalMax = rows.reduce((sum, r) => sum + r.max_marks, 0);
    const totalObtained = rows.reduce((sum, r) => sum + (r.marks_obtained ?? 0), 0);
    const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;

    // Fails overall if any subject is a fail (grace counts as pass);
    // "pending" if nothing has failed yet but some subjects still have no
    // result recorded -- distinct from "pass" so a provisional report card
    // isn't shown as a clean pass before every subject is actually in.
    const overallResult: "pass" | "fail" | "pending" = rows.some((r) => r.result === "fail")
      ? "fail"
      : rows.some((r) => r.result === null)
        ? "pending"
        : "pass";

    const activeGuardians = student.studentGuardians.filter((sg) => sg.guardian.deletedAt === null);
    const primaryGuardian = activeGuardians.find((sg) => sg.isPrimaryContact) ?? activeGuardians[0];

    return {
      student_id: studentId,
      student_name: [student.firstName, student.lastName].filter(Boolean).join(" "),
      class_name: student.currentClass?.name ?? null,
      section_name: student.currentSection?.name ?? null,
      roll_number: student.rollNumber,
      date_of_birth: student.dateOfBirth,
      guardian_name: primaryGuardian?.guardian.fullName ?? null,
      exam_name: exam.name,
      rows,
      total_obtained: totalObtained,
      total_max: totalMax,
      percentage,
      overall_result: overallResult,
      results_published: exam.resultsPublishedAt !== null,
    };
  }

  // For every subject applicable to at least one enrolled student in this
  // exam's class (mandatory subjects for the class, or a subject a given
  // student actually elected), compares how many of those students have a
  // mark entered against how many are expected, and names the responsible
  // teacher(s) via TeacherSubjectAssignment. Backs both the "pending
  // submissions" view and the publish-results completeness gate.
  async getSubmissionStatus(examId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      throw new NotFoundException("exam not found");
    }

    const students = await this.prisma.student.findMany({
      where: { currentClassId: exam.classId, deletedAt: null, status: "enrolled" },
    });

    const subjectExpected = new Map<string, { subjectName: string; studentIds: Set<string> }>();
    for (const student of students) {
      const subjects = await this.classSubjects.getApplicableSubjectsForStudent(
        exam.tenantId,
        student.id,
        exam.academicSessionId,
      );
      for (const subject of subjects) {
        const entry = subjectExpected.get(subject.subject_id) ?? {
          subjectName: subject.subject_name,
          studentIds: new Set<string>(),
        };
        entry.studentIds.add(student.id);
        subjectExpected.set(subject.subject_id, entry);
      }
    }

    const marks = await this.prisma.examMark.findMany({ where: { examId, deletedAt: null } });
    const enteredBySubject = new Map<string, Set<string>>();
    for (const mark of marks) {
      if (mark.marksObtained === null && !mark.isAbsent) continue;
      const set = enteredBySubject.get(mark.subjectId) ?? new Set<string>();
      set.add(mark.studentId);
      enteredBySubject.set(mark.subjectId, set);
    }

    const assignments = await this.prisma.teacherSubjectAssignment.findMany({
      where: { classId: exam.classId, academicSessionId: exam.academicSessionId, deletedAt: null },
      include: { staff: true },
    });
    const teachersBySubject = new Map<string, Set<string>>();
    for (const assignment of assignments) {
      const set = teachersBySubject.get(assignment.subjectId) ?? new Set<string>();
      set.add([assignment.staff.firstName, assignment.staff.lastName].filter(Boolean).join(" "));
      teachersBySubject.set(assignment.subjectId, set);
    }

    return Array.from(subjectExpected.entries()).map(([subjectId, { subjectName, studentIds }]) => {
      const enteredIds = enteredBySubject.get(subjectId) ?? new Set<string>();
      const enteredCount = Array.from(studentIds).filter((id) => enteredIds.has(id)).length;
      return {
        subject_id: subjectId,
        subject_name: subjectName,
        expected_count: studentIds.size,
        entered_count: enteredCount,
        is_complete: enteredCount === studentIds.size,
        teachers: Array.from(teachersBySubject.get(subjectId) ?? []),
      };
    });
  }

  async publishExamResults(tenantId: string, actorUserId: string, examId: string) {
    const exam = await this.prisma.exam.findFirst({ where: { id: examId, tenantId, deletedAt: null } });
    if (!exam) {
      throw new NotFoundException("exam not found");
    }
    if (exam.resultsPublishedAt) {
      throw new BadRequestException("results are already published for this exam");
    }

    const status = await this.getSubmissionStatus(examId);
    const incomplete = status.filter((s) => !s.is_complete);
    if (incomplete.length > 0) {
      throw new BadRequestException(
        `cannot publish: marks are still pending for ${incomplete.map((s) => s.subject_name).join(", ")}`,
      );
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exam.update({
        where: { id: examId },
        data: { resultsPublishedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "exams",
        entityId: examId,
        action: "update",
        summary: `Published results for exam '${exam.name}'`,
      });

      return updated;
    });
  }

  async reopenExamResults(tenantId: string, actorUserId: string, examId: string) {
    const exam = await this.prisma.exam.findFirst({ where: { id: examId, tenantId, deletedAt: null } });
    if (!exam) {
      throw new NotFoundException("exam not found");
    }
    if (!exam.resultsPublishedAt) {
      throw new BadRequestException("results are not published for this exam");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exam.update({
        where: { id: examId },
        data: { resultsPublishedAt: null, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "exams",
        entityId: examId,
        action: "update",
        summary: `Reopened results for exam '${exam.name}'`,
      });

      return updated;
    });
  }
}
