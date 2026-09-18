import { Injectable } from "@nestjs/common";

import { ScopedAccessService } from "../common/scoped-access.service.js";
import { DbService } from "../db/db.service.js";

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
    private readonly db: DbService,
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
      overdueBooksRow,
      classes,
      attendanceRows,
      feeStatusGroups,
      studentsWithDob,
      staffWithDob,
      upcomingHolidays,
      upcomingExams,
    ] = await Promise.all([
      this.db.query<{ status: string; count: string }>(
        tenantId,
        "SELECT status, COUNT(*)::text AS count FROM students WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL GROUP BY status",
        [tenantId, branchId],
      ),
      this.db.query<{ status: string }>(
        tenantId,
        "SELECT status FROM attendance_records WHERE tenant_id = $1 AND branch_id = $2 AND attendance_date = $3 AND deleted_at IS NULL",
        [tenantId, branchId, today],
      ),
      this.db.queryOne<{ paid: string; due: string }>(
        tenantId,
        "SELECT COALESCE(SUM(amount_paid), 0)::text AS paid, COALESCE(SUM(amount_due), 0)::text AS due FROM fee_invoices WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL",
        [tenantId, branchId],
      ),
      this.db.queryOne<{ count: string }>(
        tenantId,
        "SELECT COUNT(*)::text AS count FROM library_issues WHERE tenant_id = $1 AND branch_id = $2 AND status = 'issued' AND due_date < $3 AND deleted_at IS NULL",
        [tenantId, branchId, today],
      ),
      this.db.query<{ id: string; name: string; count: string }>(
        tenantId,
        `SELECT c.id, c.name, COUNT(s.id) FILTER (WHERE s.status = 'enrolled' AND s.deleted_at IS NULL)::text AS count
         FROM classes c
         LEFT JOIN students s ON s.current_class_id = c.id
         WHERE c.tenant_id = $1 AND c.branch_id = $2 AND c.deleted_at IS NULL
         GROUP BY c.id, c.name, c.sort_order
         ORDER BY c.sort_order ASC`,
        [tenantId, branchId],
      ),
      this.db.query<{ attendance_date: Date; status: string }>(
        tenantId,
        "SELECT attendance_date, status FROM attendance_records WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL AND attendance_date >= $3",
        [tenantId, branchId, fourteenDaysAgo],
      ),
      this.db.query<{ status: string; count: string; due: string; paid: string }>(
        tenantId,
        `SELECT status, COUNT(*)::text AS count, COALESCE(SUM(amount_due), 0)::text AS due, COALESCE(SUM(amount_paid), 0)::text AS paid
         FROM fee_invoices WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL GROUP BY status`,
        [tenantId, branchId],
      ),
      this.db.query<{ id: string; first_name: string; last_name: string | null; date_of_birth: Date }>(
        tenantId,
        "SELECT id, first_name, last_name, date_of_birth FROM students WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL AND status = 'enrolled' AND date_of_birth IS NOT NULL",
        [tenantId, branchId],
      ),
      this.db.query<{ id: string; first_name: string; last_name: string | null; date_of_birth: Date }>(
        tenantId,
        "SELECT id, first_name, last_name, date_of_birth FROM staff WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL AND status = 'active' AND date_of_birth IS NOT NULL",
        [tenantId, branchId],
      ),
      this.db.query<{ id: string; date: Date; name: string; type: string }>(
        tenantId,
        `SELECT ch.id, ch.date, ch.name, ch.type
         FROM calendar_holidays ch
         JOIN school_calendars sc ON sc.id = ch.school_calendar_id
         WHERE ch.tenant_id = $1 AND sc.branch_id = $2 AND sc.deleted_at IS NULL AND ch.deleted_at IS NULL
           AND ch.date >= $3 AND ch.date <= $4
         ORDER BY ch.date ASC
         LIMIT 5`,
        [tenantId, branchId, today, fourteenDaysAhead],
      ),
      canViewExams
        ? this.db.query<{ id: string; name: string; exam_date: Date }>(
            tenantId,
            `SELECT id, name, exam_date FROM exams
             WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL AND exam_date >= $3 AND exam_date <= $4
             ORDER BY exam_date ASC
             LIMIT 5`,
            [tenantId, branchId, today, fourteenDaysAhead],
          )
        : Promise.resolve([]),
    ]);

    const countByStatus = new Map(studentGroups.map((g) => [g.status, Number(g.count)]));
    const totalStudents = studentGroups.reduce((sum, g) => sum + Number(g.count), 0);

    const todaysAttendancePresent = todaysAttendance.filter((a) => a.status === "present").length;

    const feeCollectedPaise = Number(feeAgg?.paid ?? "0");
    const feeDueTotal = Number(feeAgg?.due ?? "0");
    const feePendingPaise = feeDueTotal - feeCollectedPaise;

    const enrollmentByClass = classes.map((c) => ({ class_name: c.name, count: Number(c.count) }));

    const trendByDate = new Map<string, { present: number; total: number }>();
    for (const record of attendanceRows) {
      const key = record.attendance_date.toISOString().slice(0, 10);
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
      count: Number(g.count),
      amount: Number(g.due) - Number(g.paid),
    }));

    const toBirthdayEntry = (p: { id: string; first_name: string; last_name: string | null }, role: "student" | "staff") => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(" "),
      role,
    });
    const birthdaysToday = [
      ...studentsWithDob.filter((s) => matchesMonthDay(s.date_of_birth, today)).map((s) => toBirthdayEntry(s, "student")),
      ...staffWithDob.filter((s) => matchesMonthDay(s.date_of_birth, today)).map((s) => toBirthdayEntry(s, "staff")),
    ];
    const birthdaysTomorrow = [
      ...studentsWithDob.filter((s) => matchesMonthDay(s.date_of_birth, tomorrow)).map((s) => toBirthdayEntry(s, "student")),
      ...staffWithDob.filter((s) => matchesMonthDay(s.date_of_birth, tomorrow)).map((s) => toBirthdayEntry(s, "staff")),
    ];

    return {
      total_students: totalStudents,
      enrolled_count: countByStatus.get("enrolled") ?? 0,
      applied_count: countByStatus.get("applied") ?? 0,
      alumni_count: countByStatus.get("alumni") ?? 0,
      todays_attendance_present: todaysAttendancePresent,
      todays_attendance_total: todaysAttendance.length,
      overdue_books_count: Number(overdueBooksRow?.count ?? "0"),
      enrollment_by_class: enrollmentByClass,
      attendance_trend: attendanceTrend,
      birthdays_today: birthdaysToday,
      birthdays_tomorrow: birthdaysTomorrow,
      upcoming_holidays: upcomingHolidays.map((h) => ({ id: h.id, date: h.date, name: h.name, type: h.type })),
      upcoming_exams: upcomingExams.map((e) => ({ id: e.id, name: e.name, exam_date: e.exam_date })),
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
