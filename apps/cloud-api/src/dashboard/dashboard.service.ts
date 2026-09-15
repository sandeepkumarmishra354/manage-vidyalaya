import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";

function todayUtcMidnight(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

// One aggregate call for everything the dashboard renders, rather than one
// round trip per widget. All read-only, computed fresh each time.
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(branchId: string) {
    const today = todayUtcMidnight();
    const fourteenDaysAgo = new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000);

    const [studentGroups, todaysAttendance, feeAgg, overdueBooksCount, classes, attendanceRows, feeStatusGroups] =
      await Promise.all([
        this.prisma.student.groupBy({
          by: ["status"],
          where: { branchId, deletedAt: null },
          _count: { status: true },
        }),
        this.prisma.attendanceRecord.findMany({
          where: { branchId, attendanceDate: today, deletedAt: null },
          select: { status: true },
        }),
        this.prisma.feeInvoice.aggregate({
          where: { branchId, deletedAt: null },
          _sum: { amountPaid: true, amountDue: true },
        }),
        this.prisma.libraryIssue.count({
          where: { branchId, status: "issued", dueDate: { lt: today }, deletedAt: null },
        }),
        this.prisma.class.findMany({
          where: { branchId, deletedAt: null },
          orderBy: { sortOrder: "asc" },
          include: {
            studentsCurrent: { where: { status: "enrolled", deletedAt: null }, select: { id: true } },
          },
        }),
        this.prisma.attendanceRecord.findMany({
          where: { branchId, deletedAt: null, attendanceDate: { gte: fourteenDaysAgo } },
          select: { attendanceDate: true, status: true },
        }),
        this.prisma.feeInvoice.groupBy({
          by: ["status"],
          where: { branchId, deletedAt: null },
          _count: { status: true },
          _sum: { amountDue: true, amountPaid: true },
        }),
      ]);

    const countByStatus = new Map(studentGroups.map((g) => [g.status, g._count.status]));
    const totalStudents = studentGroups.reduce((sum, g) => sum + g._count.status, 0);

    const todaysAttendancePresent = todaysAttendance.filter((a) => a.status === "present").length;

    const feeCollectedPaise = feeAgg._sum.amountPaid ?? 0;
    const feeDueTotal = feeAgg._sum.amountDue ?? 0;
    const feePendingPaise = feeDueTotal - feeCollectedPaise;

    const enrollmentByClass = classes.map((c) => ({ class_name: c.name, count: c.studentsCurrent.length }));

    const trendByDate = new Map<string, { present: number; total: number }>();
    for (const record of attendanceRows) {
      const key = record.attendanceDate.toISOString().slice(0, 10);
      const bucket = trendByDate.get(key) ?? { present: 0, total: 0 };
      bucket.total += 1;
      if (record.status === "present") {
        bucket.present += 1;
      }
      trendByDate.set(key, bucket);
    }
    const attendanceTrend = [...trendByDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { present, total }]) => ({ attendance_date: date, present_count: present, total_count: total }));

    const feeStatusBreakdown = feeStatusGroups.map((g) => ({
      status: g.status,
      count: g._count.status,
      amount: (g._sum.amountDue ?? 0) - (g._sum.amountPaid ?? 0),
    }));

    return {
      total_students: totalStudents,
      enrolled_count: countByStatus.get("enrolled") ?? 0,
      applied_count: countByStatus.get("applied") ?? 0,
      alumni_count: countByStatus.get("alumni") ?? 0,
      todays_attendance_present: todaysAttendancePresent,
      todays_attendance_total: todaysAttendance.length,
      fee_collected_paise: feeCollectedPaise,
      fee_pending_paise: feePendingPaise,
      overdue_books_count: overdueBooksCount,
      enrollment_by_class: enrollmentByClass,
      attendance_trend: attendanceTrend,
      fee_status_breakdown: feeStatusBreakdown,
    };
  }
}
