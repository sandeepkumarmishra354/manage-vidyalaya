import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScopedAccessService } from "../common/scoped-access.service.js";
import type { DbService } from "../db/db.service.js";
import { DashboardService } from "./dashboard.service.js";

function makeDbMock() {
  return {
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue({ paid: "0", due: "0", count: "0" }),
    withTransaction: vi.fn(),
  } as unknown as DbService & {
    query: ReturnType<typeof vi.fn>;
    queryOne: ReturnType<typeof vi.fn>;
  };
}

function makeScopedAccessMock(grants: Record<string, boolean> = {}) {
  return {
    hasPermission: vi.fn(async (_tenantId: string, _userId: string, key: string) => grants[key] ?? false),
  } as unknown as ScopedAccessService & { hasPermission: ReturnType<typeof vi.fn> };
}

describe("DashboardService.getStats", () => {
  let db: ReturnType<typeof makeDbMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    db = makeDbMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("omits fee fields entirely when the caller lacks fees.view", async () => {
    const scopedAccess = makeScopedAccessMock({ "fees.view": false });
    const service = new DashboardService(db, scopedAccess);

    const stats = await service.getStats("tenant-1", "user-1", "branch-1");

    expect(stats).not.toHaveProperty("fee_collected_paise");
    expect(stats).not.toHaveProperty("fee_pending_paise");
    expect(stats).not.toHaveProperty("fee_status_breakdown");
  });

  it("includes fee fields when the caller has fees.view", async () => {
    db.queryOne.mockImplementation(async (_tenantId: string, text: string) => {
      if (/SUM\(amount_paid\)/.test(text)) return { paid: "50000", due: "80000" };
      return { count: "0" };
    });
    const scopedAccess = makeScopedAccessMock({ "fees.view": true });
    const service = new DashboardService(db, scopedAccess);

    const stats = await service.getStats("tenant-1", "user-1", "branch-1");

    expect(stats.fee_collected_paise).toBe(50_000);
    expect(stats.fee_pending_paise).toBe(30_000);
  });

  it("skips the exam query and returns no upcoming exams when the caller lacks exams.view", async () => {
    const scopedAccess = makeScopedAccessMock({ "exams.view": false });
    const service = new DashboardService(db, scopedAccess);

    const stats = await service.getStats("tenant-1", "user-1", "branch-1");

    expect(db.query.mock.calls.some(([, text]) => /FROM exams/.test(text as string))).toBe(false);
    expect(stats.upcoming_exams).toEqual([]);
  });

  it("returns upcoming exams within the window when the caller has exams.view", async () => {
    db.query.mockImplementation(async (_tenantId: string, text: string) => {
      if (/FROM exams/.test(text)) {
        return [{ id: "exam-1", name: "Midterm", exam_date: new Date("2026-03-20T00:00:00.000Z") }];
      }
      return [];
    });
    const scopedAccess = makeScopedAccessMock({ "exams.view": true });
    const service = new DashboardService(db, scopedAccess);

    const stats = await service.getStats("tenant-1", "user-1", "branch-1");

    const examCall = db.query.mock.calls.find(([, text]) => /FROM exams/.test(text as string));
    expect(examCall![2]).toContain("branch-1");
    expect(stats.upcoming_exams).toEqual([{ id: "exam-1", name: "Midterm", exam_date: new Date("2026-03-20T00:00:00.000Z") }]);
  });

  it("buckets students and staff into today/tomorrow birthdays by month/day, ignoring year", async () => {
    db.query.mockImplementation(async (_tenantId: string, text: string) => {
      if (/FROM students WHERE .* status = 'enrolled'/.test(text)) {
        return [
          // Born on March 15 in a completely different year -- still "today".
          { id: "student-1", first_name: "Asha", last_name: "Rao", date_of_birth: new Date("2012-03-15T00:00:00.000Z") },
          // March 16 -- "tomorrow".
          { id: "student-2", first_name: "Bilal", last_name: null, date_of_birth: new Date("2011-03-16T00:00:00.000Z") },
          // Neither today nor tomorrow.
          { id: "student-3", first_name: "Chitra", last_name: "Iyer", date_of_birth: new Date("2010-07-01T00:00:00.000Z") },
        ];
      }
      if (/FROM staff WHERE/.test(text)) {
        return [{ id: "staff-1", first_name: "Deepa", last_name: "Nair", date_of_birth: new Date("1985-03-15T00:00:00.000Z") }];
      }
      return [];
    });
    const scopedAccess = makeScopedAccessMock();
    const service = new DashboardService(db, scopedAccess);

    const stats = await service.getStats("tenant-1", "user-1", "branch-1");

    expect(stats.birthdays_today).toEqual([
      { id: "student-1", name: "Asha Rao", role: "student" },
      { id: "staff-1", name: "Deepa Nair", role: "staff" },
    ]);
    expect(stats.birthdays_tomorrow).toEqual([{ id: "student-2", name: "Bilal", role: "student" }]);
  });

  it("returns upcoming holidays scoped to the branch's calendar within the 14-day window", async () => {
    db.query.mockImplementation(async (_tenantId: string, text: string) => {
      if (/FROM calendar_holidays/.test(text)) {
        return [{ id: "holiday-1", date: new Date("2026-03-20T00:00:00.000Z"), name: "Spring Break", type: "holiday" }];
      }
      return [];
    });
    const scopedAccess = makeScopedAccessMock();
    const service = new DashboardService(db, scopedAccess);

    const stats = await service.getStats("tenant-1", "user-1", "branch-1");

    const holidayCall = db.query.mock.calls.find(([, text]) => /FROM calendar_holidays/.test(text as string));
    expect(holidayCall![0]).toBe("tenant-1");
    expect(holidayCall![2]).toContain("branch-1");
    expect(stats.upcoming_holidays).toEqual([
      { id: "holiday-1", date: new Date("2026-03-20T00:00:00.000Z"), name: "Spring Break", type: "holiday" },
    ]);
  });
});

describe("DashboardService.getNeedsAttention", () => {
  let db: ReturnType<typeof makeDbMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    db = makeDbMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("omits every section the caller has no permission for", async () => {
    const scopedAccess = makeScopedAccessMock();
    const service = new DashboardService(db, scopedAccess);

    const result = await service.getNeedsAttention("tenant-1", "user-1", "branch-1");

    expect(result).toEqual({});
  });

  it("returns pending leave requests with staff names and a total count when the caller has staff_leave.manage", async () => {
    db.query.mockImplementation(async (_tenantId: string, text: string) => {
      if (/FROM staff_leave_requests/.test(text)) {
        return [
          {
            id: "leave-1",
            staff_id: "staff-1",
            start_date: new Date("2026-03-20T00:00:00.000Z"),
            end_date: new Date("2026-03-20T00:00:00.000Z"),
            staff_first_name: "Asha",
            staff_last_name: "Rao",
          },
        ];
      }
      return [];
    });
    db.queryOne.mockImplementation(async (_tenantId: string, text: string) => {
      if (/FROM staff_leave_requests/.test(text)) return { count: "3" };
      return { paid: "0", due: "0", count: "0" };
    });
    const scopedAccess = makeScopedAccessMock({ "staff_leave.manage": true });
    const service = new DashboardService(db, scopedAccess);

    const result = await service.getNeedsAttention("tenant-1", "user-1", "branch-1");

    expect(result.pending_leave).toEqual({
      items: [
        {
          id: "leave-1",
          staff_id: "staff-1",
          staff_name: "Asha Rao",
          start_date: new Date("2026-03-20T00:00:00.000Z"),
          end_date: new Date("2026-03-20T00:00:00.000Z"),
        },
      ],
      total_count: 3,
    });
  });

  it("omits draft promotion batches from the query filter list of deleted_at, since that table has no such column", async () => {
    const scopedAccess = makeScopedAccessMock({ "academic_setup.promote": true });
    const service = new DashboardService(db, scopedAccess);

    await service.getNeedsAttention("tenant-1", "user-1", "branch-1");

    const promotionCall = db.query.mock.calls.find(([, text]) => /FROM promotion_batches/.test(text as string));
    expect(promotionCall![1]).not.toMatch(/deleted_at/);
  });
});
