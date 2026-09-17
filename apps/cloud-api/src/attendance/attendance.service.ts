import { randomUUID } from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ScopedAccessService } from "../common/scoped-access.service.js";
import { QrTokenService } from "../qr/qr-token.service.js";
import { dayWeight, SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import type { BulkMarkAttendanceDto } from "./dto/bulk-mark-attendance.dto.js";
import type { MarkAttendanceDto } from "./dto/mark-attendance.dto.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopedAccess: ScopedAccessService,
    private readonly schoolCalendar: SchoolCalendarService,
    private readonly qrToken: QrTokenService,
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
    if (dto.attendance_date > todayIso()) {
      throw new BadRequestException("cannot mark attendance for a future date");
    }
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
    const today = todayIso();
    if (dto.entries.some((e) => e.attendance_date > today)) {
      throw new BadRequestException("cannot mark attendance for a future date");
    }
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

  // Per-student present/absent/late/half_day/leave counts over a date
  // range, plus working days in that range (holiday=0, everything else=1 --
  // a school-defined half-day still counts as a full working day, same
  // weighting payroll already uses) and a percent-present figure. Backs the
  // on-screen attendance report + its CSV export.
  async getReport(
    tenantId: string,
    branchId: string,
    classId: string,
    sectionId: string | undefined,
    startDate: string,
    endDate: string,
  ) {
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
        attendanceDate: { gte: new Date(startDate), lte: new Date(endDate) },
        deletedAt: null,
        studentId: { in: students.map((s) => s.id) },
      },
    });

    const dayTypes = await this.schoolCalendar.getDayTypesInRange(tenantId, branchId, startDate, endDate);
    const workingDays = Object.values(dayTypes).reduce((sum, t) => sum + dayWeight(t), 0);

    const countsByStudent = new Map<string, Record<string, number>>();
    for (const record of records) {
      const counts = countsByStudent.get(record.studentId) ?? {};
      counts[record.status] = (counts[record.status] ?? 0) + 1;
      countsByStudent.set(record.studentId, counts);
    }

    return students.map((s) => {
      const counts = countsByStudent.get(s.id) ?? {};
      const present = counts.present ?? 0;
      return {
        student_id: s.id,
        student_name: [s.firstName, s.lastName].filter(Boolean).join(" "),
        present,
        absent: counts.absent ?? 0,
        late: counts.late ?? 0,
        half_day: counts.half_day ?? 0,
        leave: counts.leave ?? 0,
        working_days: workingDays,
        percent_present: workingDays > 0 ? Math.round((present / workingDays) * 1000) / 10 : 0,
      };
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

  // Scan-to-mark: resolves a printed QR token straight to a "present" mark
  // for today, gated by the same additive assertCanMark check as the
  // roster-based endpoints (a logged-in operator with attendance.mark, or
  // the student's own class teacher). Idempotent -- rescanning a code that
  // already has a record for today never overwrites it (e.g. a
  // manually-corrected "absent" survives an accidental rescan).
  async scanMark(tenantId: string, actorUserId: string, token: string) {
    const parsed = this.qrToken.parse(token);
    if (parsed.type !== "student") {
      throw new BadRequestException("not a student QR code");
    }

    const student = await this.prisma.student.findFirst({
      where: { id: parsed.entityId, tenantId, deletedAt: null },
      include: { currentClass: true, currentSection: true },
    });
    if (!student) {
      throw new NotFoundException("student not found");
    }
    if (!this.qrToken.verifySignature(token, parsed, tenantId, student.qrCodeVersion)) {
      if (parsed.version < student.qrCodeVersion) {
        throw new UnauthorizedException("QR code has been reissued");
      }
      throw new UnauthorizedException("invalid QR code");
    }
    if (student.status !== "enrolled") {
      throw new BadRequestException("student is not currently enrolled");
    }

    const sectionId = student.currentSectionId ?? undefined;
    await this.assertCanMark(tenantId, actorUserId, sectionId);

    const today = todayIso();
    const dayType = await this.schoolCalendar.getDayType(tenantId, student.branchId, today);
    if (dayType === "holiday") {
      throw new BadRequestException("cannot mark attendance on a holiday");
    }

    const name = [student.firstName, student.lastName].filter(Boolean).join(" ");
    const classInfo = {
      student_id: student.id,
      name,
      class_name: student.currentClass?.name ?? null,
      section_name: student.currentSection?.name ?? null,
      photo_path: student.photoPath,
    };

    const attendanceDate = new Date(today);
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { tenantId_studentId_attendanceDate: { tenantId, studentId: student.id, attendanceDate } },
    });
    if (existing && !existing.deletedAt) {
      return { status: "already_marked" as const, existing_status: existing.status, ...classInfo };
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.attendanceRecord.upsert({
        where: { tenantId_studentId_attendanceDate: { tenantId, studentId: student.id, attendanceDate } },
        create: {
          id: randomUUID(),
          tenantId,
          branchId: student.branchId,
          studentId: student.id,
          classId: student.currentClassId ?? null,
          sectionId: student.currentSectionId ?? null,
          attendanceDate,
          status: "present",
          markedBy: actorUserId,
          updatedAt: now,
          updatedBy: actorUserId,
        },
        update: {
          status: "present",
          markedBy: actorUserId,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: student.branchId,
        actorUserId,
        entityTable: "attendance_records",
        entityId: student.id,
        action: "create",
        summary: `Marked attendance for ${name} via QR scan`,
      });
    });

    return { status: "marked" as const, ...classInfo };
  }
}
