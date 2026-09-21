import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { ScopedAccessService } from "../common/scoped-access.service.js";
import type { DbService } from "../db/db.service.js";
import type { SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import { TimetableService } from "./timetable.service.js";

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
}

function uniqueViolationError() {
  const err = new Error('duplicate key value violates unique constraint "period_slots_branch_id_academic_session_id_sort_order_key"') as Error & {
    code: string;
  };
  err.code = "23505";
  return err;
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

function makeScopedAccessMock() {
  return {
    hasPermission: vi.fn().mockResolvedValue(false),
    getActingStaff: vi.fn(),
    isClassTeacherOfSection: vi.fn().mockResolvedValue(false),
    isAssignedToSubject: vi.fn().mockResolvedValue(true),
  } as unknown as ScopedAccessService & {
    hasPermission: ReturnType<typeof vi.fn>;
    getActingStaff: ReturnType<typeof vi.fn>;
    isClassTeacherOfSection: ReturnType<typeof vi.fn>;
    isAssignedToSubject: ReturnType<typeof vi.fn>;
  };
}

function makeSchoolCalendarMock() {
  return {
    getCalendar: vi.fn().mockResolvedValue({ weekly_off_days: [0], weekly_half_days: [6], holidays: [] }),
  } as unknown as SchoolCalendarService & { getCalendar: ReturnType<typeof vi.fn> };
}

// Phase 2 branch scoping: sections carries no branch_id of its own, so the
// section-by-id lookups here join through the parent class's branch_id
// instead -- a mismatched branch comes back "not found" exactly like a
// wrong id would.
describe("TimetableService.getSectionTimetable branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: TimetableService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    schoolCalendar = makeSchoolCalendarMock();
    service = new TimetableService(db, makeAuditMock(), makeScopedAccessMock(), schoolCalendar);
  });

  it("404s for a section whose class belongs to a different branch", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    await expect(
      service.getSectionTimetable("tenant-1", "section-1", "session-1", "branch-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns the timetable for a section whose class belongs to the caller's own branch", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "section-1", class_id: "class-1", branch_id: "branch-a" });
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(
      service.getSectionTimetable("tenant-1", "section-1", "session-1", "branch-a"),
    ).resolves.toBeDefined();
  });
});

describe("TimetableService.saveSectionTimetable branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let service: TimetableService;

  const baseDto = {
    branch_id: "branch-a",
    class_id: "class-1",
    academic_session_id: "session-1",
    entries: [] as { day_of_week: number; period_slot_id: string; subject_id: string; staff_id: string }[],
  };

  beforeEach(() => {
    ({ db } = makeDbMock());
    service = new TimetableService(db, makeAuditMock(), makeScopedAccessMock(), makeSchoolCalendarMock());
  });

  it("404s saving a timetable for a section whose class belongs to a different branch", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    await expect(
      service.saveSectionTimetable("tenant-1", "actor-1", "section-1", baseDto, "branch-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("TimetableService.updatePeriodSlot branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let service: TimetableService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new TimetableService(db, makeAuditMock(), makeScopedAccessMock(), makeSchoolCalendarMock());
  });

  it("404s updating a period slot outside the caller's branch", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.updatePeriodSlot("tenant-1", "actor-1", "slot-1", { name: "Period 1", sort_order: 0, start_time: "09:00", end_time: "09:45" }, "branch-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("updates a period slot within the caller's own branch", async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: "slot-1", tenant_id: "tenant-1", branch_id: "branch-a", period_type: "teaching" }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "slot-1", tenant_id: "tenant-1", branch_id: "branch-a", period_type: "teaching", name: "Period 1" }],
      });

    await expect(
      service.updatePeriodSlot("tenant-1", "actor-1", "slot-1", { name: "Period 1", sort_order: 0, start_time: "09:00", end_time: "09:45" }, "branch-a"),
    ).resolves.toBeDefined();
  });
});

describe("TimetableService.deletePeriodSlot branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let service: TimetableService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new TimetableService(db, makeAuditMock(), makeScopedAccessMock(), makeSchoolCalendarMock());
  });

  it("404s deleting a period slot outside the caller's branch", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.deletePeriodSlot("tenant-1", "actor-1", "slot-1", "branch-a")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("TimetableService.saveSectionTimetable", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let service: TimetableService;

  const baseDto = {
    branch_id: "branch-1",
    class_id: "class-1",
    academic_session_id: "session-1",
    entries: [{ day_of_week: 1, period_slot_id: "slot-1", subject_id: "subj-1", staff_id: "staff-1" }],
  };

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    scopedAccess = makeScopedAccessMock();
    db.queryOne.mockResolvedValue({ id: "section-1" });
    service = new TimetableService(db, makeAuditMock(), scopedAccess, makeSchoolCalendarMock());
  });

  it("rejects an entry against a break/lunch period slot", async () => {
    db.query.mockResolvedValueOnce([{ id: "slot-1", period_type: "lunch" }]);

    await expect(service.saveSectionTimetable("tenant-1", "actor-1", "section-1", baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects the same teacher double-booked within the same save batch", async () => {
    db.query.mockResolvedValueOnce([{ id: "slot-1", period_type: "teaching" }]);
    const dto = {
      ...baseDto,
      entries: [
        { day_of_week: 1, period_slot_id: "slot-1", subject_id: "subj-1", staff_id: "staff-1" },
        { day_of_week: 1, period_slot_id: "slot-1", subject_id: "subj-2", staff_id: "staff-1" },
      ],
    };

    await expect(service.saveSectionTimetable("tenant-1", "actor-1", "section-1", dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects a teacher already booked in a different section at the same day/period", async () => {
    db.query
      .mockResolvedValueOnce([{ id: "slot-1", period_type: "teaching" }]) // slots
      .mockResolvedValueOnce([{ staff_id: "staff-1", day_of_week: 1, period_slot_id: "slot-1", section_name: "Section B" }]); // conflicting

    await expect(service.saveSectionTimetable("tenant-1", "actor-1", "section-1", baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("saves and returns a warning (does not throw) when the teacher has no TeacherSubjectAssignment", async () => {
    db.query
      .mockResolvedValueOnce([{ id: "slot-1", period_type: "teaching" }]) // slots
      .mockResolvedValueOnce([]); // conflicting
    scopedAccess.isAssignedToSubject.mockResolvedValueOnce(false);
    client.query.mockResolvedValue({ rows: [{ id: "entry-1", tenant_id: "tenant-1" }] });

    const result = await service.saveSectionTimetable("tenant-1", "actor-1", "section-1", baseDto);

    expect(result.warnings).toHaveLength(1);
    expect(client.query.mock.calls.some(([text]) => /INSERT INTO timetable_entries/.test(text as string))).toBe(true);
  });

  it("saves cleanly with no warnings when the teacher is properly assigned", async () => {
    db.query
      .mockResolvedValueOnce([{ id: "slot-1", period_type: "teaching" }]) // slots
      .mockResolvedValueOnce([]); // conflicting
    client.query.mockResolvedValue({ rows: [{ id: "entry-1", tenant_id: "tenant-1" }] });

    const result = await service.saveSectionTimetable("tenant-1", "actor-1", "section-1", baseDto);

    expect(result.warnings).toHaveLength(0);
    expect(client.query.mock.calls.some(([text]) => /UPDATE timetable_entries SET deleted_at/.test(text as string))).toBe(true);
    expect(client.query.mock.calls.filter(([text]) => /INSERT INTO timetable_entries/.test(text as string))).toHaveLength(1);
  });
});

describe("TimetableService.createPeriodSlot", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: TimetableService;

  const baseDto = {
    branch_id: "branch-1",
    academic_session_id: "session-1",
    name: "Period 2",
    start_time: "09:45",
    end_time: "10:30",
  };

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new TimetableService(db, audit, makeScopedAccessMock(), makeSchoolCalendarMock());
  });

  it("assigns sort_order from one past the highest sort_order ever used (not a count of survivors)", async () => {
    db.queryOne.mockResolvedValueOnce({ max_sort_order: 5 }); // max, including soft-deleted rows
    client.query.mockResolvedValueOnce({ rows: [{ id: "slot-2", tenant_id: "tenant-1", ...baseDto, sort_order: 6, period_type: "teaching" }] }); // insert

    const result = await service.createPeriodSlot("tenant-1", "actor-1", baseDto);

    const insertCall = client.query.mock.calls[0];
    expect(insertCall[1]).toContain(6);
    expect(result.sort_order).toBe(6);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("starts at 0 when no period slots (including soft-deleted ones) exist yet", async () => {
    db.queryOne.mockResolvedValueOnce({ max_sort_order: null });
    client.query.mockResolvedValueOnce({ rows: [{ id: "slot-1", tenant_id: "tenant-1", ...baseDto, sort_order: 0, period_type: "teaching" }] });

    const result = await service.createPeriodSlot("tenant-1", "actor-1", baseDto);

    expect(result.sort_order).toBe(0);
  });

  it("retries with the next sort_order on a unique-constraint clash (a genuine concurrent insert)", async () => {
    db.queryOne.mockResolvedValueOnce({ max_sort_order: 5 });
    client.query
      .mockRejectedValueOnce(uniqueViolationError())
      .mockRejectedValueOnce(uniqueViolationError())
      .mockResolvedValueOnce({ rows: [{ id: "slot-2", tenant_id: "tenant-1", ...baseDto, sort_order: 8, period_type: "teaching" }] });

    const result = await service.createPeriodSlot("tenant-1", "actor-1", baseDto);

    expect(result.sort_order).toBe(8);
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  it("propagates a non-unique-constraint error immediately without retrying", async () => {
    db.queryOne.mockResolvedValueOnce({ max_sort_order: null });
    const otherError = new Error("connection lost");
    client.query.mockRejectedValueOnce(otherError);

    await expect(service.createPeriodSlot("tenant-1", "actor-1", baseDto)).rejects.toBe(otherError);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("gives up with a ConflictException once every attempt clashes", async () => {
    db.queryOne.mockResolvedValueOnce({ max_sort_order: null });
    client.query.mockRejectedValue(uniqueViolationError());

    await expect(service.createPeriodSlot("tenant-1", "actor-1", baseDto)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("TimetableService.deletePeriodSlot", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let service: TimetableService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new TimetableService(db, makeAuditMock(), makeScopedAccessMock(), makeSchoolCalendarMock());
  });

  it("404s for a period slot outside the tenant", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.deletePeriodSlot("tenant-1", "actor-1", "slot-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("blocks deleting a period slot the timetable still uses", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "slot-1", tenant_id: "tenant-1", branch_id: "branch-1", name: "Period 1" }] })
      .mockResolvedValueOnce({ rows: [{ count: "3" }] });

    await expect(service.deletePeriodSlot("tenant-1", "actor-1", "slot-1")).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("TimetableService.getSectionTimetable", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: TimetableService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    schoolCalendar = makeSchoolCalendarMock();
    service = new TimetableService(db, makeAuditMock(), makeScopedAccessMock(), schoolCalendar);
  });

  it("404s for a section outside the tenant", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    await expect(service.getSectionTimetable("tenant-1", "section-1", "session-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("merges period slots, entries, and the branch's weekly off/half days", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "section-1", class_id: "class-1", branch_id: "branch-1" });
    db.query
      .mockResolvedValueOnce([
        {
          id: "slot-1",
          branch_id: "branch-1",
          academic_session_id: "session-1",
          name: "Period 1",
          sort_order: 0,
          start_time: "09:00",
          end_time: "09:45",
          period_type: "teaching",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "entry-1",
          day_of_week: 1,
          period_slot_id: "slot-1",
          subject_id: "subj-1",
          subject_name: "Maths",
          staff_id: "staff-1",
          first_name: "Asha",
          last_name: "Rao",
          room_name: null,
        },
      ]);

    const result = await service.getSectionTimetable("tenant-1", "section-1", "session-1");

    expect(result.period_slots).toHaveLength(1);
    expect(result.entries).toEqual([
      {
        id: "entry-1",
        day_of_week: 1,
        period_slot_id: "slot-1",
        subject_id: "subj-1",
        subject_name: "Maths",
        staff_id: "staff-1",
        staff_name: "Asha Rao",
        room_name: null,
      },
    ]);
    expect(result.weekly_off_days).toEqual([0]);
    expect(result.weekly_half_days).toEqual([6]);
    expect(schoolCalendar.getCalendar).toHaveBeenCalledWith("tenant-1", "branch-1", "session-1");
  });
});
