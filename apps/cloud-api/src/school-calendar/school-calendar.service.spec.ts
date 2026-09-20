import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { SchoolCalendarService } from "./school-calendar.service.js";

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
}

function makeDbMock() {
  const client: FakeClient = { query: vi.fn() };
  const db = {
    withTransaction: vi.fn(async (_tenantId: string, fn: (client: FakeClient) => unknown) => fn(client)),
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn(),
  } as unknown as DbService & {
    query: ReturnType<typeof vi.fn>;
    queryOne: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
  };
  return { db, client };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("SchoolCalendarService.getDayTypesInRange", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let audit: ReturnType<typeof makeAuditMock>;
  let service: SchoolCalendarService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    audit = makeAuditMock();
    service = new SchoolCalendarService(db, audit);
  });

  it("defaults every day to working when no calendar exists for the branch", async () => {
    db.query.mockImplementation(async (_tenantId: string, text: string) => {
      if (/FROM school_calendars/.test(text)) return [];
      return [];
    });

    const result = await service.getDayTypesInRange("tenant-1", "branch-1", "2026-01-04", "2026-01-05");

    expect(result).toEqual({ "2026-01-04": "working", "2026-01-05": "working" });
  });

  it("marks weekly-off days as holiday and weekly-half-days as half_day", async () => {
    // 2026-01-04 is a Sunday, 2026-01-03 a Saturday, 2026-01-05 a Monday.
    db.query.mockImplementation(async (_tenantId: string, text: string) => {
      if (/FROM school_calendars/.test(text)) {
        return [
          {
            id: "cal-1",
            weekly_off_days: [0],
            weekly_half_days: [6],
            session_start_date: new Date("2026-01-01"),
            session_end_date: new Date("2026-12-31"),
          },
        ];
      }
      if (/FROM calendar_holidays/.test(text)) return [];
      return [];
    });

    const result = await service.getDayTypesInRange("tenant-1", "branch-1", "2026-01-03", "2026-01-05");

    expect(result).toEqual({
      "2026-01-03": "half_day", // Saturday
      "2026-01-04": "holiday", // Sunday
      "2026-01-05": "working", // Monday
    });
  });

  it("lets a dated CalendarHoliday override win over the weekly rule", async () => {
    // 2026-01-05 is an ordinary Monday under the weekly rule, but named a holiday here.
    db.query.mockImplementation(async (_tenantId: string, text: string) => {
      if (/FROM school_calendars/.test(text)) {
        return [
          {
            id: "cal-1",
            weekly_off_days: [0],
            weekly_half_days: [],
            session_start_date: new Date("2026-01-01"),
            session_end_date: new Date("2026-12-31"),
          },
        ];
      }
      if (/FROM calendar_holidays/.test(text)) {
        return [{ school_calendar_id: "cal-1", date: new Date("2026-01-05"), name: "Special Holiday", type: "holiday" }];
      }
      return [];
    });

    const result = await service.getDayTypesInRange("tenant-1", "branch-1", "2026-01-05", "2026-01-05");

    expect(result).toEqual({ "2026-01-05": "holiday" });
  });

  it("resolves each date against whichever academic session's calendar it falls in", async () => {
    db.query.mockImplementation(async (_tenantId: string, text: string) => {
      if (/FROM school_calendars/.test(text)) {
        return [
          {
            id: "cal-1",
            weekly_off_days: [0],
            weekly_half_days: [],
            session_start_date: new Date("2026-01-01"),
            session_end_date: new Date("2026-06-30"),
          },
          {
            id: "cal-2",
            weekly_off_days: [], // second session has no weekly-off Sunday configured
            weekly_half_days: [],
            session_start_date: new Date("2026-07-01"),
            session_end_date: new Date("2026-12-31"),
          },
        ];
      }
      if (/FROM calendar_holidays/.test(text)) return [];
      return [];
    });

    // 2026-06-28 (Sunday, in session 1) vs 2026-08-02 (Sunday, in session 2).
    const result = await service.getDayTypesInRange("tenant-1", "branch-1", "2026-06-28", "2026-06-28");
    const result2 = await service.getDayTypesInRange("tenant-1", "branch-1", "2026-08-02", "2026-08-02");

    expect(result["2026-06-28"]).toBe("holiday");
    expect(result2["2026-08-02"]).toBe("working");
  });
});

describe("SchoolCalendarService.setWeeklyRule", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: SchoolCalendarService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new SchoolCalendarService(db, audit);
  });

  it("creates a calendar row when none exists yet, then sets the weekly rule on it", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] }) // getOrCreateCalendar: no existing row
      .mockResolvedValueOnce({ rows: [{ id: "cal-new", tenant_id: "tenant-1" }] }) // insertRow (create)
      .mockResolvedValueOnce({ rows: [{ id: "cal-new", tenant_id: "tenant-1", weekly_off_days: [0], weekly_half_days: [6] }] }); // updateRow

    await service.setWeeklyRule("tenant-1", "actor-1", {
      branch_id: "branch-1",
      academic_session_id: "session-1",
      weekly_off_days: [0],
      weekly_half_days: [6],
    });

    const insertCall = client.query.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO school_calendars/);
    const updateCall = client.query.mock.calls[2];
    expect(updateCall[0]).toMatch(/UPDATE school_calendars SET/);
    expect(updateCall[1]).toEqual(expect.arrayContaining(["cal-new"]));
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("reuses an existing calendar row instead of creating a duplicate", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "cal-existing", tenant_id: "tenant-1" }] }) // getOrCreateCalendar: existing row found
      .mockResolvedValueOnce({ rows: [{ id: "cal-existing", tenant_id: "tenant-1" }] }); // updateRow

    await service.setWeeklyRule("tenant-1", "actor-1", {
      branch_id: "branch-1",
      academic_session_id: "session-1",
      weekly_off_days: [0],
      weekly_half_days: [],
    });

    expect(client.query.mock.calls.some(([text]) => /INSERT INTO school_calendars/.test(text as string))).toBe(false);
    const updateCall = client.query.mock.calls.find(([text]) => /UPDATE school_calendars SET/.test(text as string));
    expect(updateCall![1]).toContain("cal-existing");
  });
});

describe("SchoolCalendarService.addHolidayRange", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: SchoolCalendarService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new SchoolCalendarService(db, audit);
  });

  it("throws BadRequestException when end_date is before start_date", async () => {
    await expect(
      service.addHolidayRange("tenant-1", "actor-1", {
        branch_id: "branch-1",
        academic_session_id: "session-1",
        start_date: "2026-06-10",
        end_date: "2026-06-01",
        name: "Summer vacation",
        type: "holiday",
      }),
    ).rejects.toThrow(/end_date must be on or after start_date/);
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  it("inserts one row per day in the range and records a single audit entry", async () => {
    client.query.mockImplementation(async (text: string) => {
      if (/SELECT \* FROM school_calendars/.test(text)) {
        return { rows: [{ id: "cal-1", tenant_id: "tenant-1" }] };
      }
      if (/SELECT \* FROM calendar_holidays/.test(text)) {
        return { rows: [] }; // nothing already named in this range
      }
      if (/INSERT INTO calendar_holidays/.test(text)) {
        return { rows: [{ id: "h-new", tenant_id: "tenant-1" }] };
      }
      return { rows: [] };
    });

    const result = await service.addHolidayRange("tenant-1", "actor-1", {
      branch_id: "branch-1",
      academic_session_id: "session-1",
      start_date: "2026-05-15",
      end_date: "2026-05-17",
      name: "Summer vacation",
      type: "holiday",
    });

    const insertCalls = client.query.mock.calls.filter(([text]) => /INSERT INTO calendar_holidays/.test(text as string));
    expect(insertCalls).toHaveLength(3);
    expect(result).toEqual({ count: 3, start_date: "2026-05-15", end_date: "2026-05-17" });
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("overwrites (rather than duplicates) a date already named within the range", async () => {
    client.query.mockImplementation(async (text: string) => {
      if (/SELECT \* FROM school_calendars/.test(text)) {
        return { rows: [{ id: "cal-1", tenant_id: "tenant-1" }] };
      }
      if (/SELECT \* FROM calendar_holidays/.test(text)) {
        return { rows: [{ id: "h-existing", tenant_id: "tenant-1", date: new Date("2026-05-16"), name: "Old name", type: "holiday" }] };
      }
      if (/UPDATE calendar_holidays SET/.test(text)) {
        return { rows: [{ id: "h-existing", tenant_id: "tenant-1" }] };
      }
      if (/INSERT INTO calendar_holidays/.test(text)) {
        return { rows: [{ id: "h-new", tenant_id: "tenant-1" }] };
      }
      return { rows: [] };
    });

    await service.addHolidayRange("tenant-1", "actor-1", {
      branch_id: "branch-1",
      academic_session_id: "session-1",
      start_date: "2026-05-15",
      end_date: "2026-05-17",
      name: "Summer vacation",
      type: "holiday",
    });

    const insertCalls = client.query.mock.calls.filter(([text]) => /INSERT INTO calendar_holidays/.test(text as string));
    const updateCalls = client.query.mock.calls.filter(([text]) => /UPDATE calendar_holidays SET/.test(text as string));
    expect(insertCalls).toHaveLength(2); // the 15th and 17th
    expect(updateCalls).toHaveLength(1); // the already-named 16th
    expect(updateCalls[0]![1]).toEqual(expect.arrayContaining(["h-existing"]));
  });
});

describe("SchoolCalendarService.updateHoliday / deleteHoliday", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: SchoolCalendarService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new SchoolCalendarService(db, audit);
  });

  it("throws NotFoundException updating a holiday that doesn't exist", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.updateHoliday("tenant-1", "actor-1", "missing", { date: "2026-01-01", name: "X", type: "holiday" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException deleting a holiday that doesn't exist", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.deleteHoliday("tenant-1", "actor-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
