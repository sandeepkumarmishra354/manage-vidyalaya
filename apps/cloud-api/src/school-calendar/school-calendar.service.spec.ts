import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { SchoolCalendarService } from "./school-calendar.service.js";

function makePrismaMock() {
  const tx = {
    schoolCalendar: { update: vi.fn().mockResolvedValue({ id: "cal-1" }) },
    calendarHoliday: {
      create: vi.fn().mockResolvedValue({ id: "holiday-1" }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  return {
    schoolCalendar: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    calendarHoliday: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
  } as unknown as PrismaService & {
    schoolCalendar: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    calendarHoliday: { findFirst: ReturnType<typeof vi.fn> };
    __tx: typeof tx;
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("SchoolCalendarService.getDayTypesInRange", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: SchoolCalendarService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new SchoolCalendarService(prisma, audit);
  });

  it("defaults every day to working when no calendar exists for the branch", async () => {
    prisma.schoolCalendar.findMany.mockResolvedValueOnce([]);

    const result = await service.getDayTypesInRange("tenant-1", "branch-1", "2026-01-04", "2026-01-05");

    expect(result).toEqual({ "2026-01-04": "working", "2026-01-05": "working" });
  });

  it("marks weekly-off days as holiday and weekly-half-days as half_day", async () => {
    // 2026-01-04 is a Sunday, 2026-01-03 a Saturday, 2026-01-05 a Monday.
    prisma.schoolCalendar.findMany.mockResolvedValueOnce([
      {
        weeklyOffDays: [0],
        weeklyHalfDays: [6],
        academicSession: { startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") },
        holidays: [],
      },
    ]);

    const result = await service.getDayTypesInRange("tenant-1", "branch-1", "2026-01-03", "2026-01-05");

    expect(result).toEqual({
      "2026-01-03": "half_day", // Saturday
      "2026-01-04": "holiday", // Sunday
      "2026-01-05": "working", // Monday
    });
  });

  it("lets a dated CalendarHoliday override win over the weekly rule", async () => {
    // 2026-01-05 is an ordinary Monday under the weekly rule, but named a holiday here.
    prisma.schoolCalendar.findMany.mockResolvedValueOnce([
      {
        weeklyOffDays: [0],
        weeklyHalfDays: [],
        academicSession: { startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") },
        holidays: [{ date: new Date("2026-01-05"), name: "Special Holiday", type: "holiday" }],
      },
    ]);

    const result = await service.getDayTypesInRange("tenant-1", "branch-1", "2026-01-05", "2026-01-05");

    expect(result).toEqual({ "2026-01-05": "holiday" });
  });

  it("resolves each date against whichever academic session's calendar it falls in", async () => {
    prisma.schoolCalendar.findMany.mockResolvedValue([
      {
        weeklyOffDays: [0],
        weeklyHalfDays: [],
        academicSession: { startDate: new Date("2026-01-01"), endDate: new Date("2026-06-30") },
        holidays: [],
      },
      {
        weeklyOffDays: [], // second session has no weekly-off Sunday configured
        weeklyHalfDays: [],
        academicSession: { startDate: new Date("2026-07-01"), endDate: new Date("2026-12-31") },
        holidays: [],
      },
    ]);

    // 2026-06-28 (Sunday, in session 1) vs 2026-08-02 (Sunday, in session 2).
    const result = await service.getDayTypesInRange("tenant-1", "branch-1", "2026-06-28", "2026-06-28");
    const result2 = await service.getDayTypesInRange("tenant-1", "branch-1", "2026-08-02", "2026-08-02");

    expect(result["2026-06-28"]).toBe("holiday");
    expect(result2["2026-08-02"]).toBe("working");
  });
});

describe("SchoolCalendarService.setWeeklyRule", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: SchoolCalendarService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new SchoolCalendarService(prisma, audit);
  });

  it("creates a calendar row when none exists yet, then sets the weekly rule on it", async () => {
    prisma.schoolCalendar.findFirst.mockResolvedValueOnce(null);
    prisma.schoolCalendar.create.mockResolvedValueOnce({ id: "cal-new" });

    await service.setWeeklyRule("tenant-1", "actor-1", {
      branch_id: "branch-1",
      academic_session_id: "session-1",
      weekly_off_days: [0],
      weekly_half_days: [6],
    });

    expect(prisma.schoolCalendar.create).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.schoolCalendar.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cal-new" },
        data: expect.objectContaining({ weeklyOffDays: [0], weeklyHalfDays: [6] }),
      }),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("reuses an existing calendar row instead of creating a duplicate", async () => {
    prisma.schoolCalendar.findFirst.mockResolvedValueOnce({ id: "cal-existing" });

    await service.setWeeklyRule("tenant-1", "actor-1", {
      branch_id: "branch-1",
      academic_session_id: "session-1",
      weekly_off_days: [0],
      weekly_half_days: [],
    });

    expect(prisma.schoolCalendar.create).not.toHaveBeenCalled();
    expect(prisma.__tx.schoolCalendar.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cal-existing" } }),
    );
  });
});

describe("SchoolCalendarService.updateHoliday / deleteHoliday", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: SchoolCalendarService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new SchoolCalendarService(prisma, audit);
  });

  it("throws NotFoundException updating a holiday that doesn't exist", async () => {
    prisma.calendarHoliday.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.updateHoliday("tenant-1", "actor-1", "missing", { date: "2026-01-01", name: "X", type: "holiday" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException deleting a holiday that doesn't exist", async () => {
    prisma.calendarHoliday.findFirst.mockResolvedValueOnce(null);

    await expect(service.deleteHoliday("tenant-1", "actor-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
