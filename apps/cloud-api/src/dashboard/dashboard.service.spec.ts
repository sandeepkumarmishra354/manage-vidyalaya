import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../prisma/prisma.service.js";
import type { ScopedAccessService } from "../common/scoped-access.service.js";
import { DashboardService } from "./dashboard.service.js";

function makePrismaMock() {
  return {
    student: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    staff: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    attendanceRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    feeInvoice: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountPaid: 0, amountDue: 0 } }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    libraryIssue: {
      count: vi.fn().mockResolvedValue(0),
    },
    class: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    calendarHoliday: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    exam: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

function makeScopedAccessMock(grants: Record<string, boolean> = {}) {
  return {
    hasPermission: vi.fn(async (_tenantId: string, _userId: string, key: string) => grants[key] ?? false),
  } as unknown as ScopedAccessService & { hasPermission: ReturnType<typeof vi.fn> };
}

describe("DashboardService.getStats", () => {
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    prisma = makePrismaMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("omits fee fields entirely when the caller lacks fees.view", async () => {
    const scopedAccess = makeScopedAccessMock({ "fees.view": false });
    const service = new DashboardService(prisma, scopedAccess);

    const stats = await service.getStats("tenant-1", "user-1", "branch-1");

    expect(stats).not.toHaveProperty("fee_collected_paise");
    expect(stats).not.toHaveProperty("fee_pending_paise");
    expect(stats).not.toHaveProperty("fee_status_breakdown");
  });

  it("includes fee fields when the caller has fees.view", async () => {
    (prisma.feeInvoice.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      _sum: { amountPaid: 50_000, amountDue: 80_000 },
    });
    const scopedAccess = makeScopedAccessMock({ "fees.view": true });
    const service = new DashboardService(prisma, scopedAccess);

    const stats = await service.getStats("tenant-1", "user-1", "branch-1");

    expect(stats.fee_collected_paise).toBe(50_000);
    expect(stats.fee_pending_paise).toBe(30_000);
  });

  it("skips the exam query and returns no upcoming exams when the caller lacks exams.view", async () => {
    const scopedAccess = makeScopedAccessMock({ "exams.view": false });
    const service = new DashboardService(prisma, scopedAccess);

    const stats = await service.getStats("tenant-1", "user-1", "branch-1");

    expect(prisma.exam.findMany).not.toHaveBeenCalled();
    expect(stats.upcoming_exams).toEqual([]);
  });

  it("returns upcoming exams within the window when the caller has exams.view", async () => {
    (prisma.exam.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "exam-1", name: "Midterm", examDate: new Date("2026-03-20T00:00:00.000Z") },
    ]);
    const scopedAccess = makeScopedAccessMock({ "exams.view": true });
    const service = new DashboardService(prisma, scopedAccess);

    const stats = await service.getStats("tenant-1", "user-1", "branch-1");

    expect(prisma.exam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ branchId: "branch-1" }) }),
    );
    expect(stats.upcoming_exams).toEqual([{ id: "exam-1", name: "Midterm", exam_date: new Date("2026-03-20T00:00:00.000Z") }]);
  });

  it("buckets students and staff into today/tomorrow birthdays by month/day, ignoring year", async () => {
    (prisma.student.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      // Born on March 15 in a completely different year -- still "today".
      { id: "student-1", firstName: "Asha", lastName: "Rao", dateOfBirth: new Date("2012-03-15T00:00:00.000Z") },
      // March 16 -- "tomorrow".
      { id: "student-2", firstName: "Bilal", lastName: null, dateOfBirth: new Date("2011-03-16T00:00:00.000Z") },
      // Neither today nor tomorrow.
      { id: "student-3", firstName: "Chitra", lastName: "Iyer", dateOfBirth: new Date("2010-07-01T00:00:00.000Z") },
    ]);
    (prisma.staff.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "staff-1", firstName: "Deepa", lastName: "Nair", dateOfBirth: new Date("1985-03-15T00:00:00.000Z") },
    ]);
    const scopedAccess = makeScopedAccessMock();
    const service = new DashboardService(prisma, scopedAccess);

    const stats = await service.getStats("tenant-1", "user-1", "branch-1");

    expect(stats.birthdays_today).toEqual([
      { id: "student-1", name: "Asha Rao", role: "student" },
      { id: "staff-1", name: "Deepa Nair", role: "staff" },
    ]);
    expect(stats.birthdays_tomorrow).toEqual([{ id: "student-2", name: "Bilal", role: "student" }]);
  });

  it("returns upcoming holidays scoped to the branch's calendar within the 14-day window", async () => {
    (prisma.calendarHoliday.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "holiday-1", date: new Date("2026-03-20T00:00:00.000Z"), name: "Spring Break", type: "holiday" },
    ]);
    const scopedAccess = makeScopedAccessMock();
    const service = new DashboardService(prisma, scopedAccess);

    const stats = await service.getStats("tenant-1", "user-1", "branch-1");

    expect(prisma.calendarHoliday.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ schoolCalendar: { branchId: "branch-1", deletedAt: null } }),
      }),
    );
    expect(stats.upcoming_holidays).toEqual([
      { id: "holiday-1", date: new Date("2026-03-20T00:00:00.000Z"), name: "Spring Break", type: "holiday" },
    ]);
  });
});
