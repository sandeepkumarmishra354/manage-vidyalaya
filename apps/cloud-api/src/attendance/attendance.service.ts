import { randomUUID } from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { ScopedAccessService } from "../common/scoped-access.service.js";
import { DbService } from "../db/db.service.js";
import type { TenantRow } from "../db/tenant-repo.js";
import { QrTokenService } from "../qr/qr-token.service.js";
import { dayWeight, SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import type { BulkMarkAttendanceDto } from "./dto/bulk-mark-attendance.dto.js";
import type { MarkAttendanceDto } from "./dto/mark-attendance.dto.js";

interface StudentRosterRow extends TenantRow {
  branch_id: string;
  first_name: string;
  last_name: string | null;
  current_class_id: string | null;
  current_section_id: string | null;
  status: string;
  photo_path: string | null;
  qr_code_version: number;
}

interface AttendanceRecordRow extends TenantRow {
  branch_id: string;
  student_id: string;
  class_id: string | null;
  section_id: string | null;
  attendance_date: Date;
  status: string;
  remarks: string | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly db: DbService,
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
    if (await this.scopedAccess.hasPermission(tenantId, userId, "attendance.view")) return;
    if (sectionId) {
      const staff = await this.scopedAccess.getActingStaff(tenantId, userId);
      if (staff && (await this.scopedAccess.isClassTeacherOfSection(tenantId, staff.id as string, sectionId))) return;
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
    if (await this.scopedAccess.hasPermission(tenantId, userId, "attendance.mark")) return true;
    if (sectionId) {
      const staff = await this.scopedAccess.getActingStaff(tenantId, userId);
      if (staff && (await this.scopedAccess.isClassTeacherOfSection(tenantId, staff.id as string, sectionId))) return true;
    }
    return false;
  }

  private async listRosterStudents(tenantId: string, branchId: string, classId: string, sectionId: string | undefined) {
    const conditions = ["tenant_id = $1", "branch_id = $2", "current_class_id = $3", "deleted_at IS NULL", "status = 'enrolled'"];
    const values: unknown[] = [tenantId, branchId, classId];
    if (sectionId) {
      values.push(sectionId);
      conditions.push(`current_section_id = $${values.length}`);
    }
    return this.db.query<StudentRosterRow>(
      tenantId,
      `SELECT * FROM students WHERE ${conditions.join(" AND ")} ORDER BY first_name ASC`,
      values,
    );
  }

  async getRoster(tenantId: string, branchId: string, classId: string, sectionId: string | undefined, date: string) {
    const attendanceDate = new Date(date);
    const students = await this.listRosterStudents(tenantId, branchId, classId, sectionId);
    const studentIds = students.map((s) => s.id);

    const records =
      studentIds.length > 0
        ? await this.db.query<AttendanceRecordRow>(
            tenantId,
            "SELECT * FROM attendance_records WHERE tenant_id = $1 AND attendance_date = $2 AND deleted_at IS NULL AND student_id = ANY($3)",
            [tenantId, attendanceDate, studentIds],
          )
        : [];
    const recordByStudent = new Map(records.map((r) => [r.student_id, r]));

    return students.map((s) => {
      const record = recordByStudent.get(s.id);
      return {
        student_id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
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
    const students = await this.listRosterStudents(tenantId, branchId, classId, sectionId);
    const studentIds = students.map((s) => s.id);

    const records =
      studentIds.length > 0
        ? await this.db.query<AttendanceRecordRow>(
            tenantId,
            `SELECT * FROM attendance_records
             WHERE tenant_id = $1 AND attendance_date >= $2 AND attendance_date <= $3
               AND deleted_at IS NULL AND student_id = ANY($4)`,
            [tenantId, new Date(startDate), new Date(endDate), studentIds],
          )
        : [];

    const daysByStudent = new Map<string, Record<string, { status: string; remarks: string | null }>>();
    for (const record of records) {
      const isoDate = record.attendance_date.toISOString().slice(0, 10);
      const days = daysByStudent.get(record.student_id) ?? {};
      days[isoDate] = { status: record.status, remarks: record.remarks };
      daysByStudent.set(record.student_id, days);
    }

    return students.map((s) => ({
      student_id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
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

    await this.db.withTransaction(tenantId, async (client) => {
      for (const entry of dto.entries) {
        await client.query(
          `INSERT INTO attendance_records (id, tenant_id, branch_id, student_id, class_id, section_id, attendance_date, status, remarks, marked_by, updated_at, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (tenant_id, student_id, attendance_date)
           DO UPDATE SET class_id = EXCLUDED.class_id, section_id = EXCLUDED.section_id, status = EXCLUDED.status,
             remarks = EXCLUDED.remarks, marked_by = EXCLUDED.marked_by, updated_at = EXCLUDED.updated_at,
             updated_by = EXCLUDED.updated_by, version = attendance_records.version + 1`,
          [
            randomUUID(),
            tenantId,
            dto.branch_id,
            entry.student_id,
            dto.class_id,
            dto.section_id ?? null,
            attendanceDate,
            entry.status,
            entry.remarks ?? null,
            actorUserId,
            now,
            actorUserId,
          ],
        );
      }

      await this.audit.record(client, {
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

    await this.db.withTransaction(tenantId, async (client) => {
      for (const entry of dto.entries) {
        await client.query(
          `INSERT INTO attendance_records (id, tenant_id, branch_id, student_id, class_id, section_id, attendance_date, status, remarks, marked_by, updated_at, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (tenant_id, student_id, attendance_date)
           DO UPDATE SET class_id = EXCLUDED.class_id, section_id = EXCLUDED.section_id, status = EXCLUDED.status,
             remarks = EXCLUDED.remarks, marked_by = EXCLUDED.marked_by, updated_at = EXCLUDED.updated_at,
             updated_by = EXCLUDED.updated_by, version = attendance_records.version + 1`,
          [
            randomUUID(),
            tenantId,
            dto.branch_id,
            entry.student_id,
            dto.class_id,
            dto.section_id ?? null,
            new Date(entry.attendance_date),
            entry.status,
            entry.remarks ?? null,
            actorUserId,
            now,
            actorUserId,
          ],
        );
      }

      await this.audit.record(client, {
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
    const students = await this.listRosterStudents(tenantId, branchId, classId, sectionId);
    const studentIds = students.map((s) => s.id);

    const records =
      studentIds.length > 0
        ? await this.db.query<AttendanceRecordRow>(
            tenantId,
            `SELECT * FROM attendance_records
             WHERE tenant_id = $1 AND attendance_date >= $2 AND attendance_date <= $3
               AND deleted_at IS NULL AND student_id = ANY($4)`,
            [tenantId, new Date(startDate), new Date(endDate), studentIds],
          )
        : [];

    const dayTypes = await this.schoolCalendar.getDayTypesInRange(tenantId, branchId, startDate, endDate);
    const workingDays = Object.values(dayTypes).reduce((sum, t) => sum + dayWeight(t), 0);

    const countsByStudent = new Map<string, Record<string, number>>();
    for (const record of records) {
      const counts = countsByStudent.get(record.student_id) ?? {};
      counts[record.status] = (counts[record.status] ?? 0) + 1;
      countsByStudent.set(record.student_id, counts);
    }

    return students.map((s) => {
      const counts = countsByStudent.get(s.id) ?? {};
      const present = counts.present ?? 0;
      return {
        student_id: s.id,
        student_name: [s.first_name, s.last_name].filter(Boolean).join(" "),
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

  async getStudentHistory(tenantId: string, studentId: string) {
    const records = await this.db.query<AttendanceRecordRow>(
      tenantId,
      "SELECT * FROM attendance_records WHERE tenant_id = $1 AND student_id = $2 AND deleted_at IS NULL ORDER BY attendance_date DESC LIMIT 90",
      [tenantId, studentId],
    );

    return records.map((r) => ({
      attendance_date: r.attendance_date,
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

    const student = await this.db.queryOne<StudentRosterRow>(
      tenantId,
      "SELECT * FROM students WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL",
      [parsed.entityId, tenantId],
    );
    if (!student) {
      throw new NotFoundException("student not found");
    }
    if (!this.qrToken.verifySignature(token, parsed, tenantId, student.qr_code_version)) {
      if (parsed.version < student.qr_code_version) {
        throw new UnauthorizedException("QR code has been reissued");
      }
      throw new UnauthorizedException("invalid QR code");
    }
    if (student.status !== "enrolled") {
      throw new BadRequestException("student is not currently enrolled");
    }

    const sectionId = student.current_section_id ?? undefined;
    await this.assertCanMark(tenantId, actorUserId, sectionId);

    const today = todayIso();
    const dayType = await this.schoolCalendar.getDayType(tenantId, student.branch_id, today);
    if (dayType === "holiday") {
      throw new BadRequestException("cannot mark attendance on a holiday");
    }

    const [classRow, sectionRow] = await Promise.all([
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
    ]);

    const name = [student.first_name, student.last_name].filter(Boolean).join(" ");
    const classInfo = {
      student_id: student.id,
      name,
      class_name: classRow?.name ?? null,
      section_name: sectionRow?.name ?? null,
      photo_path: student.photo_path,
    };

    const attendanceDate = new Date(today);
    const existing = await this.db.queryOne<AttendanceRecordRow>(
      tenantId,
      "SELECT * FROM attendance_records WHERE tenant_id = $1 AND student_id = $2 AND attendance_date = $3",
      [tenantId, student.id, attendanceDate],
    );
    if (existing && !existing.deleted_at) {
      return { status: "already_marked" as const, existing_status: existing.status, ...classInfo };
    }

    const now = new Date();
    await this.db.withTransaction(tenantId, async (client) => {
      await client.query(
        `INSERT INTO attendance_records (id, tenant_id, branch_id, student_id, class_id, section_id, attendance_date, status, marked_by, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'present', $8, $9, $8)
         ON CONFLICT (tenant_id, student_id, attendance_date)
         DO UPDATE SET status = 'present', marked_by = EXCLUDED.marked_by,
           updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by, version = attendance_records.version + 1`,
        [
          randomUUID(),
          tenantId,
          student.branch_id,
          student.id,
          student.current_class_id ?? null,
          student.current_section_id ?? null,
          attendanceDate,
          actorUserId,
          now,
        ],
      );

      await this.audit.record(client, {
        tenantId,
        branchId: student.branch_id,
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
