import { randomUUID } from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { ClassSubjectsService } from "../class-subjects/class-subjects.service.js";
import { ScopedAccessService } from "../common/scoped-access.service.js";
import { DbService } from "../db/db.service.js";
import { insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { StudentRow } from "../students/students.service.js";
import type { CreateExamDto } from "./dto/create-exam.dto.js";
import type { CreateSubjectDto } from "./dto/create-subject.dto.js";
import type { SaveMarksDto } from "./dto/save-marks.dto.js";
import type { UpdateExamDto } from "./dto/update-exam.dto.js";
import type { UpdateSubjectDto } from "./dto/update-subject.dto.js";

export interface SubjectRow extends TenantRow {
  branch_id: string;
  name: string;
  code: string | null;
}

export interface ExamRow extends TenantRow {
  branch_id: string;
  academic_session_id: string;
  class_id: string;
  name: string;
  exam_date: Date | null;
  exam_type: string;
  parent_exam_id: string | null;
  passing_percentage: number;
  results_published_at: Date | null;
}

interface ExamMarkRow extends TenantRow {
  exam_id: string;
  subject_id: string;
  student_id: string;
  max_marks: number;
  marks_obtained: number | null;
  is_absent: boolean;
  result: "pass" | "fail" | "grace" | null;
}

@Injectable()
export class ExamsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly scopedAccess: ScopedAccessService,
    private readonly classSubjects: ClassSubjectsService,
  ) {}

  listSubjects(tenantId: string, branchId: string) {
    return this.db.query<SubjectRow>(
      tenantId,
      "SELECT * FROM subjects WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL ORDER BY name ASC",
      [tenantId, branchId],
    );
  }

  async createSubject(tenantId: string, dto: CreateSubjectDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      return insertRow<SubjectRow>(client, "subjects", tenantId, {
        branch_id: dto.branch_id,
        name: dto.name,
        code: dto.code ?? null,
        updated_at: new Date(),
      });
    });
  }

  async updateSubject(tenantId: string, actorUserId: string, id: string, dto: UpdateSubjectDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<SubjectRow>(client, "subjects", tenantId, id, {
        name: dto.name,
        code: dto.code ?? null,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
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

  // Shared by every by-id exam lookup below (backpaper roster, marks-entry
  // authorization, teaching assignments, submission status, publish/reopen)
  // -- when branchId is given (a branch-scoped caller), an exam that exists
  // but belongs to another branch comes back as "not found" exactly like a
  // wrong id would, matching findOneForTenant's convention in tenant-repo.ts.
  private async findExamOrThrow(tenantId: string, examId: string, branchId?: string | null): Promise<ExamRow> {
    const conditions = ["id = $1", "tenant_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [examId, tenantId];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    const exam = await this.db.queryOne<ExamRow>(tenantId, `SELECT * FROM exams WHERE ${conditions.join(" AND ")}`, values);
    if (!exam) {
      throw new NotFoundException("exam not found");
    }
    return exam;
  }

  listExams(tenantId: string, branchId: string, classId?: string, academicSessionId?: string) {
    const conditions = ["tenant_id = $1", "branch_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [tenantId, branchId];
    if (classId) {
      values.push(classId);
      conditions.push(`class_id = $${values.length}`);
    }
    if (academicSessionId) {
      values.push(academicSessionId);
      conditions.push(`academic_session_id = $${values.length}`);
    }
    return this.db.query<ExamRow>(
      tenantId,
      `SELECT * FROM exams WHERE ${conditions.join(" AND ")} ORDER BY exam_date DESC, name ASC`,
      values,
    );
  }

  async createExam(tenantId: string, dto: CreateExamDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      return insertRow<ExamRow>(client, "exams", tenantId, {
        branch_id: dto.branch_id,
        academic_session_id: dto.academic_session_id,
        class_id: dto.class_id,
        name: dto.name,
        exam_date: dto.exam_date ? new Date(dto.exam_date) : null,
        exam_type: dto.exam_type ?? "regular",
        parent_exam_id: dto.parent_exam_id ?? null,
        passing_percentage: dto.passing_percentage ?? 33.0,
        updated_at: new Date(),
      });
    });
  }

  async updateExam(tenantId: string, actorUserId: string, id: string, dto: UpdateExamDto, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<ExamRow>(
        client,
        "exams",
        tenantId,
        id,
        {
          name: dto.name,
          exam_date: dto.exam_date ? new Date(dto.exam_date) : null,
          passing_percentage: dto.passing_percentage,
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
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
  async listStudentsPendingBackpaper(tenantId: string, examId: string, subjectId: string, branchId?: string | null) {
    const exam = await this.findExamOrThrow(tenantId, examId, branchId);

    const marks = await this.db.query<ExamMarkRow & { first_name: string; last_name: string | null }>(
      tenantId,
      `SELECT em.*, s.first_name, s.last_name
       FROM exam_marks em
       JOIN students s ON s.id = em.student_id
       WHERE em.tenant_id = $1 AND em.exam_id = $2 AND em.subject_id = $3 AND em.deleted_at IS NULL`,
      [tenantId, examId, subjectId],
    );

    return marks
      .filter(
        (m) =>
          m.is_absent ||
          (m.marks_obtained !== null && m.marks_obtained < (m.max_marks * exam.passing_percentage) / 100.0),
      )
      .sort((a, b) => a.first_name.localeCompare(b.first_name))
      .map((m) => ({
        student_id: m.student_id,
        first_name: m.first_name,
        last_name: m.last_name,
        marks_obtained: m.marks_obtained,
        max_marks: m.max_marks,
      }));
  }

  // Additive: exams.enter_marks holders can enter marks for any subject on
  // this exam, as today. On top of that, a staff member with a matching
  // TeacherSubjectAssignment (same class + subject + academic session) can
  // enter marks for just that subject without the broad permission. When
  // their assignment is section-scoped (not the "any section" sectionId:
  // null convention), the returned sectionId narrows the roster/edits to
  // that section only.
  private async resolveMarksEntryAccess(
    tenantId: string,
    userId: string,
    examId: string,
    subjectId: string,
    branchId?: string | null,
  ) {
    const exam = await this.findExamOrThrow(tenantId, examId, branchId);

    if (await this.scopedAccess.hasPermission(tenantId, userId, "exams.enter_marks")) {
      return { exam, sectionId: null as string | null };
    }

    const staff = await this.scopedAccess.getActingStaff(tenantId, userId);
    if (staff) {
      const conditions = [
        "tenant_id = $1",
        "staff_id = $2",
        "class_id = $3",
        "subject_id = $4",
        "academic_session_id = $5",
        "deleted_at IS NULL",
      ];
      const values: unknown[] = [tenantId, (staff as { id: string }).id, exam.class_id, subjectId, exam.academic_session_id];
      if (branchId) {
        values.push(branchId);
        conditions.push(`branch_id = $${values.length}`);
      }
      const assignment = await this.db.queryOne<{ section_id: string | null }>(
        tenantId,
        `SELECT section_id FROM teacher_subject_assignments WHERE ${conditions.join(" AND ")}`,
        values,
      );
      if (assignment) {
        return { exam, sectionId: assignment.section_id };
      }
    }

    throw new ForbiddenException("not authorized to enter marks for this subject");
  }

  // Every subject a staff member is assigned to teach for this exam's
  // class+session, regardless of whether they hold the broad
  // exams.enter_marks permission -- lets the frontend restrict a
  // non-broad-permission teacher's subject dropdown to their own subjects.
  async getMyTeachingAssignments(tenantId: string, userId: string, examId: string, branchId?: string | null) {
    const exam = await this.findExamOrThrow(tenantId, examId, branchId);

    const staff = await this.scopedAccess.getActingStaff(tenantId, userId);
    if (!staff) {
      return [];
    }

    const conditions = [
      "ta.tenant_id = $1",
      "ta.staff_id = $2",
      "ta.class_id = $3",
      "ta.academic_session_id = $4",
      "ta.deleted_at IS NULL",
    ];
    const values: unknown[] = [tenantId, (staff as { id: string }).id, exam.class_id, exam.academic_session_id];
    if (branchId) {
      values.push(branchId);
      conditions.push(`ta.branch_id = $${values.length}`);
    }
    const assignments = await this.db.query<{ subject_id: string; subject_name: string }>(
      tenantId,
      `SELECT ta.subject_id, sub.name AS subject_name
       FROM teacher_subject_assignments ta
       JOIN subjects sub ON sub.id = ta.subject_id
       WHERE ${conditions.join(" AND ")}`,
      values,
    );

    const bySubject = new Map<string, { subject_id: string; subject_name: string }>();
    for (const a of assignments) {
      bySubject.set(a.subject_id, a);
    }
    return Array.from(bySubject.values());
  }

  // Every enrolled student in the exam's class (narrowed to the caller's
  // assigned section, if their marks-entry access is section-scoped), with
  // whatever marks already exist for this exam+subject, so the UI can
  // render a marks-entry roster in one call.
  async getMarksRoster(tenantId: string, userId: string, examId: string, subjectId: string, branchId?: string | null) {
    const { exam, sectionId } = await this.resolveMarksEntryAccess(tenantId, userId, examId, subjectId, branchId);

    const conditions = ["tenant_id = $1", "current_class_id = $2", "deleted_at IS NULL", "status = 'enrolled'"];
    const values: unknown[] = [tenantId, exam.class_id];
    if (sectionId) {
      values.push(sectionId);
      conditions.push(`current_section_id = $${values.length}`);
    }
    const students = await this.db.query<StudentRow>(
      tenantId,
      `SELECT * FROM students WHERE ${conditions.join(" AND ")} ORDER BY first_name ASC`,
      values,
    );
    const studentIds = students.map((s) => s.id);

    const marks =
      studentIds.length > 0
        ? await this.db.query<ExamMarkRow>(
            tenantId,
            "SELECT * FROM exam_marks WHERE tenant_id = $1 AND exam_id = $2 AND subject_id = $3 AND student_id = ANY($4) AND deleted_at IS NULL",
            [tenantId, examId, subjectId, studentIds],
          )
        : [];
    const markByStudent = new Map(marks.map((m) => [m.student_id, m]));

    return students.map((s) => {
      const mark = markByStudent.get(s.id);
      return {
        student_id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        max_marks: mark?.max_marks ?? 100,
        marks_obtained: mark?.marks_obtained ?? null,
        is_absent: mark?.is_absent ?? false,
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

  async saveMarks(tenantId: string, actorUserId: string, dto: SaveMarksDto, branchId?: string | null) {
    const { exam, sectionId } = await this.resolveMarksEntryAccess(tenantId, actorUserId, dto.exam_id, dto.subject_id, branchId);

    if (exam.results_published_at) {
      throw new BadRequestException("results have been published for this exam; reopen results before editing marks");
    }

    if (sectionId) {
      const studentIds = dto.entries.map((e) => e.student_id);
      const students = await this.db.query<{ id: string; current_section_id: string | null }>(
        tenantId,
        "SELECT id, current_section_id FROM students WHERE tenant_id = $1 AND id = ANY($2)",
        [tenantId, studentIds],
      );
      const outsideSection = students.some((s) => s.current_section_id !== sectionId);
      if (outsideSection) {
        throw new ForbiddenException("not authorized to enter marks for students outside your assigned section");
      }
    }

    const now = new Date();

    await this.db.withTransaction(tenantId, async (client) => {
      for (const entry of dto.entries) {
        await client.query(
          `INSERT INTO exam_marks (id, tenant_id, exam_id, subject_id, student_id, max_marks, marks_obtained, is_absent, result, updated_at, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (exam_id, subject_id, student_id)
           DO UPDATE SET max_marks = EXCLUDED.max_marks, marks_obtained = EXCLUDED.marks_obtained, is_absent = EXCLUDED.is_absent,
             result = EXCLUDED.result, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by, version = exam_marks.version + 1`,
          [
            randomUUID(),
            tenantId,
            dto.exam_id,
            dto.subject_id,
            entry.student_id,
            entry.max_marks,
            entry.marks_obtained ?? null,
            entry.is_absent,
            this.computeResult(entry, exam.passing_percentage),
            now,
            actorUserId,
          ],
        );
      }
    });
  }

  async getReportCard(tenantId: string, studentId: string, examId: string, branchId?: string | null) {
    const examConditions = ["id = $1", "tenant_id = $2"];
    const examValues: unknown[] = [examId, tenantId];
    if (branchId) {
      examValues.push(branchId);
      examConditions.push(`branch_id = $${examValues.length}`);
    }
    const [student, exam] = await Promise.all([
      this.db.queryOne<StudentRow>(tenantId, "SELECT * FROM students WHERE id = $1 AND tenant_id = $2", [
        studentId,
        tenantId,
      ]),
      this.db.queryOne<ExamRow>(tenantId, `SELECT * FROM exams WHERE ${examConditions.join(" AND ")}`, examValues),
    ]);
    if (!student) {
      throw new NotFoundException("student not found");
    }
    if (!exam) {
      throw new NotFoundException("exam not found");
    }

    const [classRow, sectionRow, guardianRow] = await Promise.all([
      student.current_class_id
        ? this.db.queryOne<{ name: string }>(tenantId, "SELECT name FROM classes WHERE id = $1 AND tenant_id = $2", [
            student.current_class_id,
            tenantId,
          ])
        : Promise.resolve(null),
      student.current_section_id
        ? this.db.queryOne<{ name: string }>(tenantId, "SELECT name FROM sections WHERE id = $1 AND tenant_id = $2", [
            student.current_section_id,
            tenantId,
          ])
        : Promise.resolve(null),
      this.db.queryOne<{ full_name: string }>(
        tenantId,
        `SELECT g.full_name
         FROM student_guardians sg
         JOIN guardians g ON g.id = sg.guardian_id
         WHERE sg.tenant_id = $1 AND sg.student_id = $2 AND g.deleted_at IS NULL
         ORDER BY sg.is_primary_contact DESC
         LIMIT 1`,
        [tenantId, studentId],
      ),
    ]);

    const marks = await this.db.query<ExamMarkRow & { subject_name: string }>(
      tenantId,
      `SELECT em.*, sub.name AS subject_name
       FROM exam_marks em
       JOIN subjects sub ON sub.id = em.subject_id
       WHERE em.tenant_id = $1 AND em.exam_id = $2 AND em.student_id = $3 AND em.deleted_at IS NULL
       ORDER BY sub.name ASC`,
      [tenantId, examId, studentId],
    );

    // For each subject, check whether a back-paper exam linked to this one
    // (exams.parent_exam_id = examId) has marks for the same student --
    // shown alongside the original attempt rather than replacing it.
    const rows = await Promise.all(
      marks.map(async (m) => {
        const backpaperMark = await this.db.queryOne<ExamMarkRow>(
          tenantId,
          `SELECT em.*
           FROM exam_marks em
           JOIN exams e ON e.id = em.exam_id
           WHERE em.tenant_id = $1 AND em.subject_id = $2 AND em.student_id = $3 AND em.deleted_at IS NULL AND e.parent_exam_id = $4
           ORDER BY e.exam_date DESC NULLS LAST
           LIMIT 1`,
          [tenantId, m.subject_id, studentId, examId],
        );

        return {
          subject_name: m.subject_name,
          max_marks: m.max_marks,
          marks_obtained: m.marks_obtained,
          is_absent: m.is_absent,
          result: m.result,
          backpaper_marks_obtained: backpaperMark?.marks_obtained ?? null,
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

    return {
      student_id: studentId,
      student_name: [student.first_name, student.last_name].filter(Boolean).join(" "),
      class_name: classRow?.name ?? null,
      section_name: sectionRow?.name ?? null,
      roll_number: student.roll_number,
      date_of_birth: student.date_of_birth,
      guardian_name: guardianRow?.full_name ?? null,
      exam_name: exam.name,
      rows,
      total_obtained: totalObtained,
      total_max: totalMax,
      percentage,
      overall_result: overallResult,
      results_published: exam.results_published_at !== null,
    };
  }

  // For every subject applicable to at least one enrolled student in this
  // exam's class (mandatory subjects for the class, or a subject a given
  // student actually elected), compares how many of those students have a
  // mark entered against how many are expected, and names the responsible
  // teacher(s) via TeacherSubjectAssignment. Backs both the "pending
  // submissions" view and the publish-results completeness gate.
  async getSubmissionStatus(tenantId: string, examId: string, branchId?: string | null) {
    const exam = await this.findExamOrThrow(tenantId, examId, branchId);

    const students = await this.db.query<StudentRow>(
      tenantId,
      "SELECT * FROM students WHERE tenant_id = $1 AND current_class_id = $2 AND deleted_at IS NULL AND status = 'enrolled'",
      [tenantId, exam.class_id],
    );

    const subjectExpected = new Map<string, { subjectName: string; studentIds: Set<string> }>();
    for (const student of students) {
      const subjects = await this.classSubjects.getApplicableSubjectsForStudent(
        tenantId,
        student.id,
        exam.academic_session_id,
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

    const marks = await this.db.query<ExamMarkRow>(
      tenantId,
      "SELECT * FROM exam_marks WHERE tenant_id = $1 AND exam_id = $2 AND deleted_at IS NULL",
      [tenantId, examId],
    );
    const enteredBySubject = new Map<string, Set<string>>();
    for (const mark of marks) {
      if (mark.marks_obtained === null && !mark.is_absent) continue;
      const set = enteredBySubject.get(mark.subject_id) ?? new Set<string>();
      set.add(mark.student_id);
      enteredBySubject.set(mark.subject_id, set);
    }

    const assignmentConditions = ["ta.tenant_id = $1", "ta.class_id = $2", "ta.academic_session_id = $3", "ta.deleted_at IS NULL"];
    const assignmentValues: unknown[] = [tenantId, exam.class_id, exam.academic_session_id];
    if (branchId) {
      assignmentValues.push(branchId);
      assignmentConditions.push(`ta.branch_id = $${assignmentValues.length}`);
    }
    const assignments = await this.db.query<{ subject_id: string; first_name: string; last_name: string | null }>(
      tenantId,
      `SELECT ta.subject_id, s.first_name, s.last_name
       FROM teacher_subject_assignments ta
       JOIN staff s ON s.id = ta.staff_id
       WHERE ${assignmentConditions.join(" AND ")}`,
      assignmentValues,
    );
    const teachersBySubject = new Map<string, Set<string>>();
    for (const a of assignments) {
      const set = teachersBySubject.get(a.subject_id) ?? new Set<string>();
      set.add([a.first_name, a.last_name].filter(Boolean).join(" "));
      teachersBySubject.set(a.subject_id, set);
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

  async publishExamResults(tenantId: string, actorUserId: string, examId: string, branchId?: string | null) {
    const exam = await this.findExamOrThrow(tenantId, examId, branchId);
    if (exam.results_published_at) {
      throw new BadRequestException("results are already published for this exam");
    }

    const status = await this.getSubmissionStatus(tenantId, examId, branchId);
    const incomplete = status.filter((s) => !s.is_complete);
    if (incomplete.length > 0) {
      throw new BadRequestException(
        `cannot publish: marks are still pending for ${incomplete.map((s) => s.subject_name).join(", ")}`,
      );
    }

    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<ExamRow>(
        client,
        "exams",
        tenantId,
        examId,
        {
          results_published_at: new Date(),
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
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

  async reopenExamResults(tenantId: string, actorUserId: string, examId: string, branchId?: string | null) {
    const exam = await this.findExamOrThrow(tenantId, examId, branchId);
    if (!exam.results_published_at) {
      throw new BadRequestException("results are not published for this exam");
    }

    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<ExamRow>(
        client,
        "exams",
        tenantId,
        examId,
        {
          results_published_at: null,
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
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
