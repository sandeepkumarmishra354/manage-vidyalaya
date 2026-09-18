import { Injectable } from "@nestjs/common";

import { ScopedAccessService } from "../common/scoped-access.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

function todayUtcMidnight(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

function matchesMonthDay(date: Date, reference: Date): boolean {
  return date.getUTCMonth() === reference.getUTCMonth() && date.getUTCDate() === reference.getUTCDate();
}

// One aggregate call for everything the dashboard renders, rather than one
// round trip per widget. All read-only, computed fresh each time.
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopedAccess: ScopedAccessService,
  ) {}

  async getStats(tenantId: string, userId: string, branchId: string) {
    const today = todayUtcMidnight();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000);
    const fourteenDaysAhead = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Fee totals are financially sensitive -- a teacher role shouldn't see
    // total fees collected/pending, so the fields are omitted entirely from
    // the response (not just hidden client-side) when the caller lacks
    // fees.view. Upcoming exams are similarly gated by exams.view; birthdays
    // and holidays aren't sensitive, so they're open to any authenticated user.
    const [canViewFees, canViewExams] = await Promise.all([
      this.scopedAccess.hasPermission(tenantId, userId, "fees.view"),
      this.scopedAccess.hasPermission(tenantId, userId, "exams.view"),
    ]);

    const [
      studentGroups,
      todaysAttendance,
      feeAgg,
      overdueBooksCount,
      classes,
      attendanceRows,
      feeStatusGroups,
      studentsWithDob,
      staffWithDob,
      upcomingHolidays,
      upcomingExams,
    ] = await Promise.all([
      this.prisma.student.groupBy({
        by: ["status"],
        where: { tenantId, branchId, deletedAt: null },
        _count: { status: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { tenantId, branchId, attendanceDate: today, deletedAt: null },
        select: { status: true },
      }),
      this.prisma.feeInvoice.aggregate({
        where: { tenantId, branchId, deletedAt: null },
        _sum: { amountPaid: true, amountDue: true },
      }),
      this.prisma.libraryIssue.count({
        where: { tenantId, branchId, status: "issued", dueDate: { lt: today }, deletedAt: null },
      }),
      this.prisma.class.findMany({
        where: { tenantId, branchId, deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          studentsCurrent: { where: { status: "enrolled", deletedAt: null }, select: { id: true } },
        },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { tenantId, branchId, deletedAt: null, attendanceDate: { gte: fourteenDaysAgo } },
        select: { attendanceDate: true, status: true },
      }),
      this.prisma.feeInvoice.groupBy({
        by: ["status"],
        where: { tenantId, branchId, deletedAt: null },
        _count: { status: true },
        _sum: { amountDue: true, amountPaid: true },
      }),
      this.prisma.student.findMany({
        where: { tenantId, branchId, deletedAt: null, status: "enrolled", dateOfBirth: { not: null } },
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
      }),
      this.prisma.staff.findMany({
        where: { tenantId, branchId, deletedAt: null, status: "active", dateOfBirth: { not: null } },
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
      }),
      this.prisma.calendarHoliday.findMany({
        where: {
          tenantId,
          deletedAt: null,
          date: { gte: today, lte: fourteenDaysAhead },
          schoolCalendar: { branchId, deletedAt: null },
        },
        orderBy: { date: "asc" },
        take: 5,
      }),
      canViewExams
        ? this.prisma.exam.findMany({
            where: { tenantId, branchId, deletedAt: null, examDate: { gte: today, lte: fourteenDaysAhead } },
            orderBy: { examDate: "asc" },
            take: 5,
          })
        : Promise.resolve([]),
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

    const toBirthdayEntry = (p: { id: string; firstName: string; lastName: string | null }, role: "student" | "staff") => ({
      id: p.id,
      name: [p.firstName, p.lastName].filter(Boolean).join(" "),
      role,
    });
    const birthdaysToday = [
      ...studentsWithDob.filter((s) => matchesMonthDay(s.dateOfBirth!, today)).map((s) => toBirthdayEntry(s, "student")),
      ...staffWithDob.filter((s) => matchesMonthDay(s.dateOfBirth!, today)).map((s) => toBirthdayEntry(s, "staff")),
    ];
    const birthdaysTomorrow = [
      ...studentsWithDob.filter((s) => matchesMonthDay(s.dateOfBirth!, tomorrow)).map((s) => toBirthdayEntry(s, "student")),
      ...staffWithDob.filter((s) => matchesMonthDay(s.dateOfBirth!, tomorrow)).map((s) => toBirthdayEntry(s, "staff")),
    ];

    return {
      total_students: totalStudents,
      enrolled_count: countByStatus.get("enrolled") ?? 0,
      applied_count: countByStatus.get("applied") ?? 0,
      alumni_count: countByStatus.get("alumni") ?? 0,
      todays_attendance_present: todaysAttendancePresent,
      todays_attendance_total: todaysAttendance.length,
      overdue_books_count: overdueBooksCount,
      enrollment_by_class: enrollmentByClass,
      attendance_trend: attendanceTrend,
      birthdays_today: birthdaysToday,
      birthdays_tomorrow: birthdaysTomorrow,
      upcoming_holidays: upcomingHolidays.map((h) => ({ id: h.id, date: h.date, name: h.name, type: h.type })),
      upcoming_exams: upcomingExams.map((e) => ({ id: e.id, name: e.name, exam_date: e.examDate })),
      ...(canViewFees
        ? {
            fee_collected_paise: feeCollectedPaise,
            fee_pending_paise: feePendingPaise,
            fee_status_breakdown: feeStatusBreakdown,
          }
        : {}),
    };
  }
}
