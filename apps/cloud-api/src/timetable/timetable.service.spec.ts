import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { ScopedAccessService } from "../common/scoped-access.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import { TimetableService } from "./timetable.service.js";

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`sort_order`)", {
    code: "P2002",
    clientVersion: "6.19.3",
  });
}

function makePrismaMock() {
  const tx = { timetableEntry: { updateMany: vi.fn(), create: vi.fn() } };
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
    periodSlot: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    timetableEntry: { count: vi.fn(), findMany: vi.fn() },
    section: { findFirst: vi.fn() },
    staff: { findFirst: vi.fn() },
  } as unknown as PrismaService & {
    __tx: typeof tx;
    periodSlot: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    timetableEntry: { count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    section: { findFirst: ReturnType<typeof vi.fn> };
    staff: { findFirst: ReturnType<typeof vi.fn> };
  };
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

describe("TimetableService.saveSectionTimetable", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let service: TimetableService;

  const baseDto = {
    branch_id: "branch-1",
    class_id: "class-1",
    academic_session_id: "session-1",
    entries: [{ day_of_week: 1, period_slot_id: "slot-1", subject_id: "subj-1", staff_id: "staff-1" }],
  };

  beforeEach(() => {
    prisma = makePrismaMock();
    scopedAccess = makeScopedAccessMock();
    prisma.section.findFirst.mockResolvedValue({ id: "section-1", classId: "class-1" });
    prisma.timetableEntry.findMany.mockResolvedValue([]);
    service = new TimetableService(prisma, makeAuditMock(), scopedAccess, makeSchoolCalendarMock());
  });

  it("rejects an entry against a break/lunch period slot", async () => {
    prisma.periodSlot.findMany.mockResolvedValueOnce([{ id: "slot-1", periodType: "lunch" }]);

    await expect(service.saveSectionTimetable("tenant-1", "actor-1", "section-1", baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects the same teacher double-booked within the same save batch", async () => {
    prisma.periodSlot.findMany.mockResolvedValueOnce([{ id: "slot-1", periodType: "teaching" }]);
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
    prisma.periodSlot.findMany.mockResolvedValueOnce([{ id: "slot-1", periodType: "teaching" }]);
    prisma.timetableEntry.findMany.mockResolvedValueOnce([
      { staffId: "staff-1", dayOfWeek: 1, periodSlotId: "slot-1", section: { name: "Section B" } },
    ]);

    await expect(service.saveSectionTimetable("tenant-1", "actor-1", "section-1", baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("saves and returns a warning (does not throw) when the teacher has no TeacherSubjectAssignment", async () => {
    prisma.periodSlot.findMany.mockResolvedValueOnce([{ id: "slot-1", periodType: "teaching" }]);
    scopedAccess.isAssignedToSubject.mockResolvedValueOnce(false);

    const result = await service.saveSectionTimetable("tenant-1", "actor-1", "section-1", baseDto);

    expect(result.warnings).toHaveLength(1);
    expect(prisma.__tx.timetableEntry.create).toHaveBeenCalledTimes(1);
  });

  it("saves cleanly with no warnings when the teacher is properly assigned", async () => {
    prisma.periodSlot.findMany.mockResolvedValueOnce([{ id: "slot-1", periodType: "teaching" }]);

    const result = await service.saveSectionTimetable("tenant-1", "actor-1", "section-1", baseDto);

    expect(result.warnings).toHaveLength(0);
    expect(prisma.__tx.timetableEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.timetableEntry.create).toHaveBeenCalledTimes(1);
  });
});

describe("TimetableService.createPeriodSlot", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
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
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new TimetableService(prisma, audit, makeScopedAccessMock(), makeSchoolCalendarMock());
  });

  it("assigns sort_order from the current count of non-deleted slots", async () => {
    prisma.periodSlot.count.mockResolvedValueOnce(1);
    prisma.periodSlot.create.mockResolvedValueOnce({ id: "slot-2", ...baseDto, sortOrder: 1, periodType: "teaching" });

    const result = await service.createPeriodSlot("tenant-1", "actor-1", baseDto);

    expect(prisma.periodSlot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 1 }) }),
    );
    expect(result.sort_order).toBe(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("retries with the next sort_order on a unique-constraint clash (stale count or a soft-deleted slot's old value)", async () => {
    prisma.periodSlot.count.mockResolvedValueOnce(1);
    prisma.periodSlot.create
      .mockRejectedValueOnce(uniqueConstraintError())
      .mockRejectedValueOnce(uniqueConstraintError())
      .mockResolvedValueOnce({ id: "slot-2", ...baseDto, sortOrder: 3, periodType: "teaching" });

    const result = await service.createPeriodSlot("tenant-1", "actor-1", baseDto);

    expect(result.sort_order).toBe(3);
    expect(prisma.periodSlot.create).toHaveBeenCalledTimes(3);
  });

  it("propagates a non-unique-constraint error immediately without retrying", async () => {
    prisma.periodSlot.count.mockResolvedValueOnce(0);
    const otherError = new Error("connection lost");
    prisma.periodSlot.create.mockRejectedValueOnce(otherError);

    await expect(service.createPeriodSlot("tenant-1", "actor-1", baseDto)).rejects.toBe(otherError);
    expect(prisma.periodSlot.create).toHaveBeenCalledTimes(1);
  });

  it("gives up with a ConflictException once every attempt clashes", async () => {
    prisma.periodSlot.count.mockResolvedValueOnce(0);
    prisma.periodSlot.create.mockRejectedValue(uniqueConstraintError());

    await expect(service.createPeriodSlot("tenant-1", "actor-1", baseDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("TimetableService.deletePeriodSlot", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: TimetableService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new TimetableService(prisma, makeAuditMock(), makeScopedAccessMock(), makeSchoolCalendarMock());
  });

  it("404s for a period slot outside the tenant", async () => {
    prisma.periodSlot.findFirst.mockResolvedValueOnce(null);

    await expect(service.deletePeriodSlot("tenant-1", "actor-1", "slot-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("blocks deleting a period slot the timetable still uses", async () => {
    prisma.periodSlot.findFirst.mockResolvedValueOnce({ id: "slot-1", branchId: "branch-1", name: "Period 1" });
    prisma.timetableEntry.count.mockResolvedValueOnce(3);

    await expect(service.deletePeriodSlot("tenant-1", "actor-1", "slot-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("TimetableService.getSectionTimetable", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: TimetableService;

  beforeEach(() => {
    prisma = makePrismaMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new TimetableService(prisma, makeAuditMock(), makeScopedAccessMock(), schoolCalendar);
  });

  it("404s for a section outside the tenant", async () => {
    prisma.section.findFirst.mockResolvedValueOnce(null);

    await expect(service.getSectionTimetable("tenant-1", "section-1", "session-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("merges period slots, entries, and the branch's weekly off/half days", async () => {
    prisma.section.findFirst.mockResolvedValueOnce({
      id: "section-1",
      classId: "class-1",
      class: { branchId: "branch-1" },
    });
    prisma.periodSlot.findMany.mockResolvedValueOnce([
      { id: "slot-1", branchId: "branch-1", academicSessionId: "session-1", name: "Period 1", sortOrder: 0, startTime: "09:00", endTime: "09:45", periodType: "teaching" },
    ]);
    prisma.timetableEntry.findMany.mockResolvedValueOnce([
      {
        id: "entry-1",
        dayOfWeek: 1,
        periodSlotId: "slot-1",
        subjectId: "subj-1",
        subject: { name: "Maths" },
        staffId: "staff-1",
        staff: { firstName: "Asha", lastName: "Rao" },
        roomName: null,
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
