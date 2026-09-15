import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import type { MarkAttendanceDto } from "./dto/mark-attendance.dto.js";

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

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

  // Upserts attendance for every student in the roster for one date.
  // Re-marking a date updates the existing row (bumping its version)
  // rather than creating a duplicate, via the UNIQUE (tenant_id,
  // student_id, attendance_date) constraint.
  async markAttendance(tenantId: string, actorUserId: string, dto: MarkAttendanceDto) {
    const now = new Date();
    const attendanceDate = new Date(dto.attendance_date);

    await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.attendanceRecord.upsert({
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
        }),
      ),
    );
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
