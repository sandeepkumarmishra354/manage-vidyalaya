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

  // Everything an admin/HR user might need to act on, surfaced in one place
  // instead of requiring a separate visit to each module. Same shape as
  // getStats: permission checks up front, one Promise.all fan-out, and each
  // section omitted entirely (not just hidden) when the caller lacks the
  // relevant permission. Each category returns a capped list (LIMIT 5) plus
  // a separate total_count so the payload stays bounded regardless of how
  // much is actually pending.
  async getNeedsAttention(tenantId: string, userId: string, branchId: string) {
    const today = todayUtcMidnight();

    const [
      canManageLeave,
      canConfirmAdmissions,
      canManageLibraryIssues,
      canViewFees,
      canManageExams,
      canPromote,
      canFinalizePayroll,
    ] = await Promise.all([
      this.scopedAccess.hasPermission(tenantId, userId, "staff_leave.manage"),
      this.scopedAccess.hasPermission(tenantId, userId, "admissions.confirm"),
      this.scopedAccess.hasPermission(tenantId, userId, "library.manage_issues"),
      this.scopedAccess.hasPermission(tenantId, userId, "fees.view"),
      this.scopedAccess.hasPermission(tenantId, userId, "exams.manage_exams"),
      this.scopedAccess.hasPermission(tenantId, userId, "academic_setup.promote"),
      this.scopedAccess.hasPermission(tenantId, userId, "payroll.finalize"),
    ]);

    const empty = { items: [] as unknown[], total_count: 0 };

    const [
      pendingLeave,
      pendingAdmissions,
      overdueBooks,
      overdueFees,
      unpublishedExams,
      draftPromotions,
      draftPayrollRuns,
    ] = await Promise.all([
      canManageLeave
        ? Promise.all([
            this.db.query<{
              id: string;
              staff_id: string;
              start_date: Date;
              end_date: Date;
              staff_first_name: string;
              staff_last_name: string | null;
            }>(
              tenantId,
              `SELECT lr.id, lr.staff_id, lr.start_date, lr.end_date, s.first_name AS staff_first_name, s.last_name AS staff_last_name
               FROM staff_leave_requests lr
               JOIN staff s ON s.id = lr.staff_id
               WHERE lr.tenant_id = $1 AND lr.branch_id = $2 AND lr.status = 'pending' AND lr.deleted_at IS NULL
               ORDER BY lr.created_at ASC
               LIMIT 5`,
              [tenantId, branchId],
            ),
            this.db.queryOne<{ count: string }>(
              tenantId,
              "SELECT COUNT(*)::text AS count FROM staff_leave_requests WHERE tenant_id = $1 AND branch_id = $2 AND status = 'pending' AND deleted_at IS NULL",
              [tenantId, branchId],
            ),
          ]).then(([rows, countRow]) => ({
            items: rows.map((r) => ({
              id: r.id,
              staff_id: r.staff_id,
              staff_name: [r.staff_first_name, r.staff_last_name].filter(Boolean).join(" "),
              start_date: r.start_date,
              end_date: r.end_date,
            })),
            total_count: Number(countRow?.count ?? "0"),
          }))
        : Promise.resolve(empty),

      // students has no created_at column -- updated_at is the closest
      // available proxy for "how long has this been pending" (it's set at
      // insert time and only changes again if the row is later edited).
      canConfirmAdmissions
        ? Promise.all([
            this.db.query<{ id: string; first_name: string; last_name: string | null; updated_at: Date }>(
              tenantId,
              `SELECT id, first_name, last_name, updated_at FROM students
               WHERE tenant_id = $1 AND branch_id = $2 AND status = 'applied' AND deleted_at IS NULL
               ORDER BY updated_at ASC
               LIMIT 5`,
              [tenantId, branchId],
            ),
            this.db.queryOne<{ count: string }>(
              tenantId,
              "SELECT COUNT(*)::text AS count FROM students WHERE tenant_id = $1 AND branch_id = $2 AND status = 'applied' AND deleted_at IS NULL",
              [tenantId, branchId],
            ),
          ]).then(([rows, countRow]) => ({
            items: rows.map((r) => ({
              id: r.id,
              student_name: [r.first_name, r.last_name].filter(Boolean).join(" "),
              applied_at: r.updated_at,
            })),
            total_count: Number(countRow?.count ?? "0"),
          }))
        : Promise.resolve(empty),

      canManageLibraryIssues
        ? Promise.all([
            this.db.query<{
              id: string;
              student_id: string;
              first_name: string;
              last_name: string | null;
              title: string;
              due_date: Date;
            }>(
              tenantId,
              `SELECT li.id, li.student_id, s.first_name, s.last_name, b.title, li.due_date
               FROM library_issues li
               JOIN library_books b ON b.id = li.book_id
               JOIN students s ON s.id = li.student_id
               WHERE li.tenant_id = $1 AND li.branch_id = $2 AND li.status = 'issued' AND li.due_date < $3 AND li.deleted_at IS NULL
               ORDER BY li.due_date ASC
               LIMIT 5`,
              [tenantId, branchId, today],
            ),
            this.db.queryOne<{ count: string }>(
              tenantId,
              "SELECT COUNT(*)::text AS count FROM library_issues WHERE tenant_id = $1 AND branch_id = $2 AND status = 'issued' AND due_date < $3 AND deleted_at IS NULL",
              [tenantId, branchId, today],
            ),
          ]).then(([rows, countRow]) => ({
            items: rows.map((r) => ({
              id: r.id,
              student_id: r.student_id,
              student_name: [r.first_name, r.last_name].filter(Boolean).join(" "),
              book_title: r.title,
              due_date: r.due_date,
            })),
            total_count: Number(countRow?.count ?? "0"),
          }))
        : Promise.resolve(empty),

      canViewFees
        ? Promise.all([
            this.db.query<{
              id: string;
              student_id: string;
              first_name: string;
              last_name: string | null;
              amount_due: number;
              amount_paid: number;
              due_date: Date | null;
            }>(
              tenantId,
              `SELECT fi.id, fi.student_id, s.first_name, s.last_name, fi.amount_due, fi.amount_paid, fi.due_date
               FROM fee_invoices fi
               JOIN students s ON s.id = fi.student_id
               WHERE fi.tenant_id = $1 AND fi.branch_id = $2 AND fi.status = 'overdue' AND fi.deleted_at IS NULL
               ORDER BY fi.due_date ASC
               LIMIT 5`,
              [tenantId, branchId],
            ),
            this.db.queryOne<{ count: string }>(
              tenantId,
              "SELECT COUNT(*)::text AS count FROM fee_invoices WHERE tenant_id = $1 AND branch_id = $2 AND status = 'overdue' AND deleted_at IS NULL",
              [tenantId, branchId],
            ),
          ]).then(([rows, countRow]) => ({
            items: rows.map((r) => ({
              id: r.id,
              student_id: r.student_id,
              student_name: [r.first_name, r.last_name].filter(Boolean).join(" "),
              amount_due: r.amount_due,
              amount_paid: r.amount_paid,
              due_date: r.due_date,
            })),
            total_count: Number(countRow?.count ?? "0"),
          }))
        : Promise.resolve(empty),

      canManageExams
        ? Promise.all([
            this.db.query<{ id: string; name: string; exam_date: Date }>(
              tenantId,
              `SELECT id, name, exam_date FROM exams
               WHERE tenant_id = $1 AND branch_id = $2 AND exam_date < $3 AND results_published_at IS NULL AND deleted_at IS NULL
               ORDER BY exam_date ASC
               LIMIT 5`,
              [tenantId, branchId, today],
            ),
            this.db.queryOne<{ count: string }>(
              tenantId,
              "SELECT COUNT(*)::text AS count FROM exams WHERE tenant_id = $1 AND branch_id = $2 AND exam_date < $3 AND results_published_at IS NULL AND deleted_at IS NULL",
              [tenantId, branchId, today],
            ),
          ]).then(([rows, countRow]) => ({
            items: rows,
            total_count: Number(countRow?.count ?? "0"),
          }))
        : Promise.resolve(empty),

      // promotion_batches has no deleted_at column, unlike every other
      // table queried here.
      canPromote
        ? Promise.all([
            this.db.query<{
              id: string;
              executed_at: Date | null;
              from_session_name: string;
              to_session_name: string;
            }>(
              tenantId,
              `SELECT pb.id, pb.executed_at, fs.name AS from_session_name, ts.name AS to_session_name
               FROM promotion_batches pb
               JOIN academic_sessions fs ON fs.id = pb.from_session_id
               JOIN academic_sessions ts ON ts.id = pb.to_session_id
               WHERE pb.tenant_id = $1 AND pb.branch_id = $2 AND pb.status = 'draft'
               ORDER BY pb.created_at DESC
               LIMIT 5`,
              [tenantId, branchId],
            ),
            this.db.queryOne<{ count: string }>(
              tenantId,
              "SELECT COUNT(*)::text AS count FROM promotion_batches WHERE tenant_id = $1 AND branch_id = $2 AND status = 'draft'",
              [tenantId, branchId],
            ),
          ]).then(([rows, countRow]) => ({
            items: rows,
            total_count: Number(countRow?.count ?? "0"),
          }))
        : Promise.resolve(empty),

      canFinalizePayroll
        ? Promise.all([
            this.db.query<{ id: string; period_month: number; period_year: number }>(
              tenantId,
              `SELECT id, period_month, period_year FROM payroll_runs
               WHERE tenant_id = $1 AND branch_id = $2 AND status = 'draft' AND deleted_at IS NULL
               ORDER BY period_year DESC, period_month DESC
               LIMIT 5`,
              [tenantId, branchId],
            ),
            this.db.queryOne<{ count: string }>(
              tenantId,
              "SELECT COUNT(*)::text AS count FROM payroll_runs WHERE tenant_id = $1 AND branch_id = $2 AND status = 'draft' AND deleted_at IS NULL",
              [tenantId, branchId],
            ),
          ]).then(([rows, countRow]) => ({
            items: rows,
            total_count: Number(countRow?.count ?? "0"),
          }))
        : Promise.resolve(empty),
    ]);

    return {
      ...(canManageLeave ? { pending_leave: pendingLeave } : {}),
      ...(canConfirmAdmissions ? { pending_admissions: pendingAdmissions } : {}),
      ...(canManageLibraryIssues ? { overdue_books: overdueBooks } : {}),
      ...(canViewFees ? { overdue_fees: overdueFees } : {}),
      ...(canManageExams ? { unpublished_exams: unpublishedExams } : {}),
      ...(canPromote ? { draft_promotions: draftPromotions } : {}),
      ...(canFinalizePayroll ? { draft_payroll_runs: draftPayrollRuns } : {}),
    };
  }
}
