import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { QrTokenService } from "../qr/qr-token.service.js";
import { dayWeight, SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import type { BulkMarkStaffAttendanceDto } from "./dto/bulk-mark-staff-attendance.dto.js";
import type { MarkStaffAttendanceDto } from "./dto/mark-staff-attendance.dto.js";
import { staffAllowsAccess } from "./staff-status.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class StaffAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly schoolCalendar: SchoolCalendarService,
    private readonly qrToken: QrTokenService,
  ) {}

  async getRoster(branchId: string, date: string) {
    const attendanceDate = new Date(date);

    const staff = await this.prisma.staff.findMany({
      where: { branchId, deletedAt: null, status: "active" },
      orderBy: { firstName: "asc" },
    });

    const records = await this.prisma.staffAttendance.findMany({
      where: { attendanceDate, deletedAt: null, staffId: { in: staff.map((s) => s.id) } },
    });
    const recordByStaff = new Map(records.map((r) => [r.staffId, r]));

    return staff.map((s) => {
      const record = recordByStaff.get(s.id);
      return {
        staff_id: s.id,
        first_name: s.firstName,
        last_name: s.lastName,
        designation: s.designation,
        status: record?.status ?? null,
        remarks: record?.remarks ?? null,
      };
    });
  }

  // Same roster shape as getRoster, but pre-fills a whole date range (used
  // by the month-grid calendar view) instead of a single date -- each
  // staff member's `days` map is keyed by ISO date (YYYY-MM-DD).
  async getRosterRange(branchId: string, startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const staff = await this.prisma.staff.findMany({
      where: { branchId, deletedAt: null, status: "active" },
      orderBy: { firstName: "asc" },
    });

    const records = await this.prisma.staffAttendance.findMany({
      where: {
        attendanceDate: { gte: start, lte: end },
        deletedAt: null,
        staffId: { in: staff.map((s) => s.id) },
      },
    });

    const daysByStaff = new Map<string, Record<string, { status: string; remarks: string | null }>>();
    for (const record of records) {
      const isoDate = record.attendanceDate.toISOString().slice(0, 10);
      const days = daysByStaff.get(record.staffId) ?? {};
      days[isoDate] = { status: record.status, remarks: record.remarks };
      daysByStaff.set(record.staffId, days);
    }

    return staff.map((s) => ({
      staff_id: s.id,
      first_name: s.firstName,
      last_name: s.lastName,
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
    await this.assertTargetsAllowAttendance(dto.entries.map((e) => e.staff_id));
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const entry of dto.entries) {
        const attendanceDate = new Date(entry.attendance_date);
        await tx.staffAttendance.upsert({
          where: {
            tenantId_staffId_attendanceDate: {
              tenantId,
              staffId: entry.staff_id,
              attendanceDate,
            },
          },
          create: {
            id: randomUUID(),
            tenantId,
            branchId: dto.branch_id,
            staffId: entry.staff_id,
            attendanceDate,
            status: entry.status,
            remarks: entry.remarks ?? null,
            markedBy: actorUserId,
            updatedAt: now,
            updatedBy: actorUserId,
          },
          update: {
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
    await this.assertTargetsAllowAttendance(dto.entries.map((e) => e.staff_id));
    const now = new Date();
    const attendanceDate = new Date(dto.attendance_date);

    await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.staffAttendance.upsert({
          where: {
            tenantId_staffId_attendanceDate: {
              tenantId,
              staffId: entry.staff_id,
              attendanceDate,
            },
          },
          create: {
            id: randomUUID(),
            tenantId,
            branchId: dto.branch_id,
            staffId: entry.staff_id,
            attendanceDate,
            status: entry.status,
            remarks: entry.remarks ?? null,
            markedBy: actorUserId,
            updatedAt: now,
            updatedBy: actorUserId,
          },
          update: {
            status: entry.status,
            remarks: entry.remarks ?? null,
            markedBy: actorUserId,
            updatedAt: now,
            updatedBy: actorUserId,
            version: { increment: 1 },
          },
        }),
      ),
    );
  }

  // Per-staff present/absent/late/half_day/leave counts over a date range,
  // mirroring AttendanceService.getReport for students. Backs the on-screen
  // attendance report + its CSV export.
  async getReport(tenantId: string, branchId: string, startDate: string, endDate: string) {
    const staff = await this.prisma.staff.findMany({
      where: { tenantId, branchId, deletedAt: null, status: "active" },
      orderBy: { firstName: "asc" },
    });

    const records = await this.prisma.staffAttendance.findMany({
      where: {
        attendanceDate: { gte: new Date(startDate), lte: new Date(endDate) },
        deletedAt: null,
        staffId: { in: staff.map((s) => s.id) },
      },
    });

    const dayTypes = await this.schoolCalendar.getDayTypesInRange(tenantId, branchId, startDate, endDate);
    const workingDays = Object.values(dayTypes).reduce((sum, t) => sum + dayWeight(t), 0);

    const countsByStaff = new Map<string, Record<string, number>>();
    for (const record of records) {
      const counts = countsByStaff.get(record.staffId) ?? {};
      counts[record.status] = (counts[record.status] ?? 0) + 1;
      countsByStaff.set(record.staffId, counts);
    }

    return staff.map((s) => {
      const counts = countsByStaff.get(s.id) ?? {};
      const present = counts.present ?? 0;
      return {
        staff_id: s.id,
        staff_name: [s.firstName, s.lastName].filter(Boolean).join(" "),
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
  // here.
  private async assertTargetsAllowAttendance(staffIds: string[]) {
    const uniqueIds = [...new Set(staffIds)];
    const staff = await this.prisma.staff.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, status: true, firstName: true, lastName: true },
    });
    const blocked = staff.filter((s) => !staffAllowsAccess(s.status));
    if (blocked.length > 0) {
      const names = blocked.map((s) => `${s.firstName} ${s.lastName ?? ""}`.trim()).join(", ");
      throw new BadRequestException(`Cannot mark attendance for staff who aren't active: ${names}`);
    }
  }

  async getStaffHistory(staffId: string) {
    const records = await this.prisma.staffAttendance.findMany({
      where: { staffId, deletedAt: null },
      orderBy: { attendanceDate: "desc" },
      take: 90,
    });

    return records.map((r) => ({ attendance_date: r.attendanceDate, status: r.status, remarks: r.remarks }));
  }

  // Scan-to-mark, mirroring AttendanceService.scanMark for students. No
  // class-teacher concept for staff -- authorization is flat
  // (staff_attendance.mark), enforced by @RequirePermission on the
  // controller route rather than in here.
  async scanMark(tenantId: string, actorUserId: string, token: string) {
    const parsed = this.qrToken.parse(token);
    if (parsed.type !== "staff") {
      throw new BadRequestException("not a staff QR code");
    }

    const staff = await this.prisma.staff.findFirst({ where: { id: parsed.entityId, tenantId, deletedAt: null } });
    if (!staff) {
      throw new NotFoundException("staff member not found");
    }
    if (!this.qrToken.verifySignature(token, parsed, tenantId, staff.qrCodeVersion)) {
      if (parsed.version < staff.qrCodeVersion) {
        throw new UnauthorizedException("QR code has been reissued");
      }
      throw new UnauthorizedException("invalid QR code");
    }
    if (!staffAllowsAccess(staff.status)) {
      throw new BadRequestException("cannot mark attendance for staff who aren't active");
    }

    const today = todayIso();
    const dayType = await this.schoolCalendar.getDayType(tenantId, staff.branchId, today);
    if (dayType === "holiday") {
      throw new BadRequestException("cannot mark attendance on a holiday");
    }

    const name = [staff.firstName, staff.lastName].filter(Boolean).join(" ");
    const personInfo = {
      staff_id: staff.id,
      name,
      designation: staff.designation,
      photo_path: staff.photoPath,
    };

    const attendanceDate = new Date(today);
    const existing = await this.prisma.staffAttendance.findUnique({
      where: { tenantId_staffId_attendanceDate: { tenantId, staffId: staff.id, attendanceDate } },
    });
    if (existing && !existing.deletedAt) {
      return { status: "already_marked" as const, existing_status: existing.status, ...personInfo };
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.staffAttendance.upsert({
        where: { tenantId_staffId_attendanceDate: { tenantId, staffId: staff.id, attendanceDate } },
        create: {
          id: randomUUID(),
          tenantId,
          branchId: staff.branchId,
          staffId: staff.id,
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
        branchId: staff.branchId,
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
