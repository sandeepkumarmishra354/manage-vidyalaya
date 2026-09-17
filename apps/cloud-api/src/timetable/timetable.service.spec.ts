import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { ScopedAccessService } from "../common/scoped-access.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import { TimetableService } from "./timetable.service.js";

function makePrismaMock() {
  const tx = { timetableEntry: { updateMany: vi.fn(), create: vi.fn() } };
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
    periodSlot: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    timetableEntry: { count: vi.fn(), findMany: vi.fn() },
    section: { findFirst: vi.fn() },
    staff: { findFirst: vi.fn() },
  } as unknown as PrismaService & {
    __tx: typeof tx;
    periodSlot: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
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
