import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import type { MarkStaffAttendanceDto } from "./dto/mark-staff-attendance.dto.js";

@Injectable()
export class StaffAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

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
