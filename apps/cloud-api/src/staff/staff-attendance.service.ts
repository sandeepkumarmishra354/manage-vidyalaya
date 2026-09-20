import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import type { TenantRow } from "../db/tenant-repo.js";
import { QrTokenService } from "../qr/qr-token.service.js";
import { dayWeight, SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import type { BulkMarkStaffAttendanceDto } from "./dto/bulk-mark-staff-attendance.dto.js";
import type { MarkStaffAttendanceDto } from "./dto/mark-staff-attendance.dto.js";
import type { StaffRow } from "./staff.service.js";
import { staffAllowsAccess } from "./staff-status.js";

export interface StaffAttendanceRow extends TenantRow {
  branch_id: string;
  staff_id: string;
  attendance_date: Date;
  status: string;
  remarks: string | null;
  marked_by: string | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class StaffAttendanceService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly schoolCalendar: SchoolCalendarService,
    private readonly qrToken: QrTokenService,
  ) {}

  async getRoster(tenantId: string, branchId: string, date: string) {
    const attendanceDate = new Date(date);

    const staff = await this.db.query<StaffRow>(
      tenantId,
      "SELECT * FROM staff WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL AND status = 'active' ORDER BY first_name ASC",
      [tenantId, branchId],
    );
    const staffIds = staff.map((s) => s.id);

    const records =
      staffIds.length > 0
        ? await this.db.query<StaffAttendanceRow>(
            tenantId,
            "SELECT * FROM staff_attendance WHERE tenant_id = $1 AND attendance_date = $2 AND deleted_at IS NULL AND staff_id = ANY($3)",
            [tenantId, attendanceDate, staffIds],
          )
        : [];
    const recordByStaff = new Map(records.map((r) => [r.staff_id, r]));

    return staff.map((s) => {
      const record = recordByStaff.get(s.id);
      return {
        staff_id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        designation: s.designation,
        status: record?.status ?? null,
        remarks: record?.remarks ?? null,
      };
    });
  }

  // Same roster shape as getRoster, but pre-fills a whole date range (used
  // by the month-grid calendar view) instead of a single date -- each
  // staff member's `days` map is keyed by ISO date (YYYY-MM-DD).
  async getRosterRange(tenantId: string, branchId: string, startDate: string, endDate: string) {
    const staff = await this.db.query<StaffRow>(
      tenantId,
      "SELECT * FROM staff WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL AND status = 'active' ORDER BY first_name ASC",
      [tenantId, branchId],
    );
    const staffIds = staff.map((s) => s.id);

    const records =
      staffIds.length > 0
        ? await this.db.query<StaffAttendanceRow>(
            tenantId,
            `SELECT * FROM staff_attendance
             WHERE tenant_id = $1 AND attendance_date >= $2 AND attendance_date <= $3
               AND deleted_at IS NULL AND staff_id = ANY($4)`,
            [tenantId, new Date(startDate), new Date(endDate), staffIds],
          )
        : [];

    const daysByStaff = new Map<string, Record<string, { status: string; remarks: string | null }>>();
    for (const record of records) {
      const isoDate = record.attendance_date.toISOString().slice(0, 10);
      const days = daysByStaff.get(record.staff_id) ?? {};
      days[isoDate] = { status: record.status, remarks: record.remarks };
      daysByStaff.set(record.staff_id, days);
    }

    return staff.map((s) => ({
      staff_id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      designation: s.designation,
      days: daysByStaff.get(s.id) ?? {},
    }));
  }

  // Same upsert as markAttendance, but each entry carries its own date --
  // the calendar/month-grid's "save the whole month in one action" path.
  async markAttendanceBulk(tenantId: string, actorUserId: string, dto: BulkMarkStaffAttendanceDto) {
    const today = todayIso();
    if (dto.entries.some((e) => e.attendance_date > today)) {
      throw new BadRequestException("cannot mark attendance for a future date");
    }
    await this.assertTargetsAllowAttendance(
      tenantId,
      dto.entries.map((e) => e.staff_id),
      dto.branch_id,
    );
    const now = new Date();

    await this.db.withTransaction(tenantId, async (client) => {
      for (const entry of dto.entries) {
        await client.query(
          `INSERT INTO staff_attendance (id, tenant_id, branch_id, staff_id, attendance_date, status, remarks, marked_by, updated_at, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (tenant_id, staff_id, attendance_date)
           DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks, marked_by = EXCLUDED.marked_by,
             updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by, version = staff_attendance.version + 1`,
          [
            randomUUID(),
            tenantId,
            dto.branch_id,
            entry.staff_id,
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
        entityTable: "staff_attendance",
        entityId: dto.branch_id,
        action: "update",
        summary: `Bulk-marked ${dto.entries.length} staff attendance entries across multiple dates`,
      });
    });
  }

  async markAttendance(tenantId: string, actorUserId: string, dto: MarkStaffAttendanceDto) {
    if (dto.attendance_date > todayIso()) {
      throw new BadRequestException("cannot mark attendance for a future date");
    }
    await this.assertTargetsAllowAttendance(
      tenantId,
      dto.entries.map((e) => e.staff_id),
      dto.branch_id,
    );
    const now = new Date();
    const attendanceDate = new Date(dto.attendance_date);

    await this.db.withTransaction(tenantId, async (client) => {
      for (const entry of dto.entries) {
        await client.query(
          `INSERT INTO staff_attendance (id, tenant_id, branch_id, staff_id, attendance_date, status, remarks, marked_by, updated_at, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (tenant_id, staff_id, attendance_date)
           DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks, marked_by = EXCLUDED.marked_by,
             updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by, version = staff_attendance.version + 1`,
          [
            randomUUID(),
            tenantId,
            dto.branch_id,
            entry.staff_id,
            attendanceDate,
            entry.status,
            entry.remarks ?? null,
            actorUserId,
            now,
            actorUserId,
          ],
        );
      }
    });
  }

  // Per-staff present/absent/late/half_day/leave counts over a date range,
  // mirroring AttendanceService.getReport for students. Backs the on-screen
  // attendance report + its CSV export.
  async getReport(tenantId: string, branchId: string, startDate: string, endDate: string) {
    const staff = await this.db.query<StaffRow>(
      tenantId,
      "SELECT * FROM staff WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL AND status = 'active' ORDER BY first_name ASC",
      [tenantId, branchId],
    );
    const staffIds = staff.map((s) => s.id);

    const records =
      staffIds.length > 0
        ? await this.db.query<StaffAttendanceRow>(
            tenantId,
            `SELECT * FROM staff_attendance
             WHERE tenant_id = $1 AND attendance_date >= $2 AND attendance_date <= $3
               AND deleted_at IS NULL AND staff_id = ANY($4)`,
            [tenantId, new Date(startDate), new Date(endDate), staffIds],
          )
        : [];

    const dayTypes = await this.schoolCalendar.getDayTypesInRange(tenantId, branchId, startDate, endDate);
    const workingDays = Object.values(dayTypes).reduce((sum, t) => sum + dayWeight(t), 0);

    const countsByStaff = new Map<string, Record<string, number>>();
    for (const record of records) {
      const counts = countsByStaff.get(record.staff_id) ?? {};
      counts[record.status] = (counts[record.status] ?? 0) + 1;
      countsByStaff.set(record.staff_id, counts);
    }

    return staff.map((s) => {
      const counts = countsByStaff.get(s.id) ?? {};
      const present = counts.present ?? 0;
      return {
        staff_id: s.id,
        staff_name: [s.first_name, s.last_name].filter(Boolean).join(" "),
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

  // Marking attendance goes straight from staff_id to an upsert, bypassing
  // getRoster's status:"active" filter -- so a relieved/terminated staff id
  // (submitted directly rather than via the roster UI) needs its own check
  // here. Tenant-scoped: a staff_id belonging to another tenant is treated
  // the same as a missing one (rejected), never silently written into this
  // tenant's attendance table.
  // branchId (dto.branch_id, already forced to the caller's own branch by
  // BranchScopeGuard) is checked the same way -- a staff_id from another
  // branch is rejected as "not found", so a branch-scoped caller can't mark
  // attendance under a branch_id they don't own for staff outside it either.
  private async assertTargetsAllowAttendance(tenantId: string, staffIds: string[], branchId: string | null) {
    const uniqueIds = [...new Set(staffIds)];
    const conditions = ["tenant_id = $1", "id = ANY($2)"];
    const values: unknown[] = [tenantId, uniqueIds];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    const staff = await this.db.query<StaffRow>(
      tenantId,
      `SELECT * FROM staff WHERE ${conditions.join(" AND ")}`,
      values,
    );
    const foundIds = new Set(staff.map((s) => s.id));
    const missing = uniqueIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundException("one or more staff members not found");
    }
    const blocked = staff.filter((s) => !staffAllowsAccess(s.status));
    if (blocked.length > 0) {
      const names = blocked.map((s) => `${s.first_name} ${s.last_name ?? ""}`.trim()).join(", ");
      throw new BadRequestException(`Cannot mark attendance for staff who aren't active: ${names}`);
    }
  }

  async getStaffHistory(tenantId: string, staffId: string, branchId: string | null) {
    const conditions = ["tenant_id = $1", "staff_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [tenantId, staffId];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    const records = await this.db.query<StaffAttendanceRow>(
      tenantId,
      `SELECT * FROM staff_attendance WHERE ${conditions.join(" AND ")} ORDER BY attendance_date DESC LIMIT 90`,
      values,
    );

    return records.map((r) => ({ attendance_date: r.attendance_date, status: r.status, remarks: r.remarks }));
  }

  // Scan-to-mark, mirroring AttendanceService.scanMark for students. No
  // class-teacher concept for staff -- authorization is flat
  // (staff_attendance.mark), enforced by @RequirePermission on the
  // controller route rather than in here. branchId gates which staff QR
  // codes a branch-scoped scanner (e.g. front-desk kiosk) can mark --
  // mirrors every other by-id staff lookup.
  async scanMark(tenantId: string, actorUserId: string, token: string, branchId: string | null) {
    const parsed = this.qrToken.parse(token);
    if (parsed.type !== "staff") {
      throw new BadRequestException("not a staff QR code");
    }

    const conditions = ["id = $1", "tenant_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [parsed.entityId, tenantId];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    const staff = await this.db.queryOne<StaffRow>(
      tenantId,
      `SELECT * FROM staff WHERE ${conditions.join(" AND ")}`,
      values,
    );
    if (!staff) {
      throw new NotFoundException("staff member not found");
    }
    if (!this.qrToken.verifySignature(token, parsed, tenantId, staff.qr_code_version)) {
      if (parsed.version < staff.qr_code_version) {
        throw new UnauthorizedException("QR code has been reissued");
      }
      throw new UnauthorizedException("invalid QR code");
    }
    if (!staffAllowsAccess(staff.status)) {
      throw new BadRequestException("cannot mark attendance for staff who aren't active");
    }

    const today = todayIso();
    const dayType = await this.schoolCalendar.getDayType(tenantId, staff.branch_id, today);
    if (dayType === "holiday") {
      throw new BadRequestException("cannot mark attendance on a holiday");
    }

    const name = [staff.first_name, staff.last_name].filter(Boolean).join(" ");
    const personInfo = {
      staff_id: staff.id,
      name,
      designation: staff.designation,
      photo_path: staff.photo_path,
    };

    const attendanceDate = new Date(today);
    const existing = await this.db.queryOne<StaffAttendanceRow>(
      tenantId,
      "SELECT * FROM staff_attendance WHERE tenant_id = $1 AND staff_id = $2 AND attendance_date = $3",
      [tenantId, staff.id, attendanceDate],
    );
    if (existing && !existing.deleted_at) {
      return { status: "already_marked" as const, existing_status: existing.status, ...personInfo };
    }

    const now = new Date();
    await this.db.withTransaction(tenantId, async (client) => {
      await client.query(
        `INSERT INTO staff_attendance (id, tenant_id, branch_id, staff_id, attendance_date, status, marked_by, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, 'present', $6, $7, $6)
         ON CONFLICT (tenant_id, staff_id, attendance_date)
         DO UPDATE SET status = 'present', marked_by = EXCLUDED.marked_by,
           updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by, version = staff_attendance.version + 1`,
        [randomUUID(), tenantId, staff.branch_id, staff.id, attendanceDate, actorUserId, now],
      );

      await this.audit.record(client, {
        tenantId,
        branchId: staff.branch_id,
        actorUserId,
        entityTable: "staff_attendance",
        entityId: staff.id,
        action: "create",
        summary: `Marked attendance for ${name} via QR scan`,
      });
    });

    return { status: "marked" as const, ...personInfo };
  }
}
