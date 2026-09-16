import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { BulkMarkStaffAttendanceDto } from "./dto/bulk-mark-staff-attendance.dto.js";
import type { MarkStaffAttendanceDto } from "./dto/mark-staff-attendance.dto.js";

@Injectable()
export class StaffAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

  async getStaffHistory(staffId: string) {
    const records = await this.prisma.staffAttendance.findMany({
      where: { staffId, deletedAt: null },
      orderBy: { attendanceDate: "desc" },
      take: 90,
    });

    return records.map((r) => ({ attendance_date: r.attendanceDate, status: r.status, remarks: r.remarks }));
  }
}
