import { randomUUID } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
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

  // Every enrolled student in the exam's class, with whatever marks already
  // exist for this exam+subject, so the UI can render a marks-entry roster
  // in one call.
  async getMarksRoster(examId: string, subjectId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      throw new NotFoundException("exam not found");
    }

    const students = await this.prisma.student.findMany({
      where: { currentClassId: exam.classId, deletedAt: null, status: "enrolled" },
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
      };
    });
  }

  async saveMarks(tenantId: string, actorUserId: string, dto: SaveMarksDto) {
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
            updatedAt: now,
            updatedBy: actorUserId,
          },
          update: {
            maxMarks: entry.max_marks,
            marksObtained: entry.marks_obtained ?? null,
            isAbsent: entry.is_absent,
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
      this.prisma.student.findUniqueOrThrow({ where: { id: studentId } }),
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
          backpaper_marks_obtained: backpaperMark?.marksObtained ?? null,
        };
      }),
    );

    const totalMax = rows.reduce((sum, r) => sum + r.max_marks, 0);
    const totalObtained = rows.reduce((sum, r) => sum + (r.marks_obtained ?? 0), 0);
    const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;

    return {
      student_id: studentId,
      student_name: [student.firstName, student.lastName].filter(Boolean).join(" "),
      exam_name: exam.name,
      rows,
      total_obtained: totalObtained,
      total_max: totalMax,
      percentage,
    };
  }
}
