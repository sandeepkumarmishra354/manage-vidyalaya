import { randomUUID } from "node:crypto";

import { ForbiddenException, Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ScopedAccessService } from "../common/scoped-access.service.js";
import type { BulkMarkAttendanceDto } from "./dto/bulk-mark-attendance.dto.js";
import type { MarkAttendanceDto } from "./dto/mark-attendance.dto.js";

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopedAccess: ScopedAccessService,
  ) {}

  // Additive: anyone holding attendance.view can view any class/section as
  // today. On top of that, a staff member who is the class teacher of the
  // target section can view it even without that broad permission -- but
  // that narrower right only applies when a section_id is actually given
  // (there's no "my sections" relationship to fall back to without one).
  async assertCanView(tenantId: string, userId: string, sectionId: string | undefined) {
    if (await this.scopedAccess.hasPermission(userId, "attendance.view")) return;
    if (sectionId) {
      const staff = await this.scopedAccess.getActingStaff(tenantId, userId);
      if (staff && (await this.scopedAccess.isClassTeacherOfSection(staff.id, sectionId))) return;
    }
    throw new ForbiddenException("not authorized to view attendance for this section");
  }

  async assertCanMark(tenantId: string, userId: string, sectionId: string | null | undefined) {
    if (!(await this.canMark(tenantId, userId, sectionId))) {
      throw new ForbiddenException("not authorized to mark attendance for this section");
    }
  }

  // Non-throwing variant backing GET /attendance/can-mark -- lets the
  // frontend decide whether to show the "Save" affordance at all, rather
  // than showing it and letting the POST fail.
  async canMark(tenantId: string, userId: string, sectionId: string | null | undefined): Promise<boolean> {
    if (await this.scopedAccess.hasPermission(userId, "attendance.mark")) return true;
    if (sectionId) {
      const staff = await this.scopedAccess.getActingStaff(tenantId, userId);
      if (staff && (await this.scopedAccess.isClassTeacherOfSection(staff.id, sectionId))) return true;
    }
    return false;
  }

  async getRoster(tenantId: string, branchId: string, classId: string, sectionId: string | undefined, date: string) {
    const attendanceDate = new Date(date);

    const students = await this.prisma.student.findMany({
      where: {
        tenantId,
        branchId,
        currentClassId: classId,
        deletedAt: null,
        status: "enrolled",
        ...(sectionId ? { currentSectionId: sectionId } : {}),
      },
      orderBy: { firstName: "asc" },
    });

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        tenantId,
        attendanceDate,
        deletedAt: null,
        studentId: { in: students.map((s) => s.id) },
      },
    });
    const recordByStudent = new Map(records.map((r) => [r.studentId, r]));

    return students.map((s) => {
      const record = recordByStudent.get(s.id);
      return {
        student_id: s.id,
        first_name: s.firstName,
        last_name: s.lastName,
        status: record?.status ?? null,
        remarks: record?.remarks ?? null,
      };
    });
  }

  // Same roster shape as getRoster, but pre-fills a whole date range (used
  // by the month-grid calendar view) instead of a single date -- each
  // student's `days` map is keyed by ISO date (YYYY-MM-DD).
  async getRosterRange(
    tenantId: string,
    branchId: string,
    classId: string,
    sectionId: string | undefined,
    startDate: string,
    endDate: string,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const students = await this.prisma.student.findMany({
      where: {
        tenantId,
        branchId,
        currentClassId: classId,
        deletedAt: null,
        status: "enrolled",
        ...(sectionId ? { currentSectionId: sectionId } : {}),
      },
      orderBy: { firstName: "asc" },
    });

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        tenantId,
        attendanceDate: { gte: start, lte: end },
        deletedAt: null,
        studentId: { in: students.map((s) => s.id) },
      },
    });

    const daysByStudent = new Map<string, Record<string, { status: string; remarks: string | null }>>();
    for (const record of records) {
      const isoDate = record.attendanceDate.toISOString().slice(0, 10);
      const days = daysByStudent.get(record.studentId) ?? {};
      days[isoDate] = { status: record.status, remarks: record.remarks };
      daysByStudent.set(record.studentId, days);
    }

    return students.map((s) => ({
      student_id: s.id,
      first_name: s.firstName,
      last_name: s.lastName,
      days: daysByStudent.get(s.id) ?? {},
    }));
  }

  // Upserts attendance for every student in the roster for one date.
  // Re-marking a date updates the existing row (bumping its version)
  // rather than creating a duplicate, via the UNIQUE (tenant_id,
  // student_id, attendance_date) constraint.
  async markAttendance(tenantId: string, actorUserId: string, dto: MarkAttendanceDto) {
    const now = new Date();
    const attendanceDate = new Date(dto.attendance_date);

    await this.prisma.$transaction(async (tx) => {
      for (const entry of dto.entries) {
        await tx.attendanceRecord.upsert({
          where: {
            tenantId_studentId_attendanceDate: {
              tenantId,
              studentId: entry.student_id,
              attendanceDate,
            },
          },
          create: {
            id: randomUUID(),
            tenantId,
            branchId: dto.branch_id,
            studentId: entry.student_id,
            classId: dto.class_id,
            sectionId: dto.section_id ?? null,
            attendanceDate,
            status: entry.status,
            remarks: entry.remarks ?? null,
            markedBy: actorUserId,
            updatedAt: now,
            updatedBy: actorUserId,
          },
          update: {
            classId: dto.class_id,
            sectionId: dto.section_id ?? null,
            status: entry.status,
            remarks: entry.remarks ?? null,
            markedBy: actorUserId,
            updatedAt: now,
            updatedBy: actorUserId,
            version: { increment: 1 },
          },
        });
      }

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "attendance_records",
        entityId: dto.class_id,
        action: "update",
        summary: `Marked attendance for ${dto.entries.length} student(s) on ${dto.attendance_date}`,
      });
    });
  }

  // Same upsert as markAttendance, but each entry carries its own date --
  // the calendar/month-grid's "save the whole month in one action" path.
  async markAttendanceBulk(tenantId: string, actorUserId: string, dto: BulkMarkAttendanceDto) {
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const entry of dto.entries) {
        const attendanceDate = new Date(entry.attendance_date);
        await tx.attendanceRecord.upsert({
          where: {
            tenantId_studentId_attendanceDate: {
              tenantId,
              studentId: entry.student_id,
              attendanceDate,
            },
          },
          create: {
            id: randomUUID(),
            tenantId,
            branchId: dto.branch_id,
            studentId: entry.student_id,
            classId: dto.class_id,
            sectionId: dto.section_id ?? null,
            attendanceDate,
            status: entry.status,
            remarks: entry.remarks ?? null,
            markedBy: actorUserId,
            updatedAt: now,
            updatedBy: actorUserId,
          },
          update: {
            classId: dto.class_id,
            sectionId: dto.section_id ?? null,
            status: entry.status,
            remarks: entry.remarks ?? null,
            markedBy: actorUserId,
            updatedAt: now,
            updatedBy: actorUserId,
            version: { increment: 1 },
          },
        });
      }

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "attendance_records",
        entityId: dto.class_id,
        action: "update",
        summary: `Bulk-marked ${dto.entries.length} attendance entries across multiple dates`,
      });
    });
  }

  async getStudentHistory(studentId: string) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: { studentId, deletedAt: null },
      orderBy: { attendanceDate: "desc" },
      take: 90,
    });

    return records.map((r) => ({
      attendance_date: r.attendanceDate,
      status: r.status,
      remarks: r.remarks,
    }));
  }
}
