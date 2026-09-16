import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import { StaffAttendanceService } from "./staff-attendance.service.js";

function makePrismaMock() {
  const tx = { staffAttendance: { upsert: vi.fn() } };
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
    staff: { findMany: vi.fn() },
    staffAttendance: { findMany: vi.fn() },
  } as unknown as PrismaService & {
    __tx: typeof tx;
    staff: { findMany: ReturnType<typeof vi.fn> };
    staffAttendance: { findMany: ReturnType<typeof vi.fn> };
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

function makeSchoolCalendarMock() {
  return { getDayTypesInRange: vi.fn(async () => ({})), getDayType: vi.fn() } as unknown as SchoolCalendarService;
}

describe("StaffAttendanceService.getRosterRange", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: StaffAttendanceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new StaffAttendanceService(prisma, audit, schoolCalendar);
  });

  it("groups records into a per-staff, per-ISO-date map", async () => {
    prisma.staff.findMany.mockResolvedValueOnce([
      { id: "staff-1", firstName: "Asha", lastName: "Rao", designation: "Teacher" },
      { id: "staff-2", firstName: "Bilal", lastName: null, designation: "Clerk" },
    ]);
    prisma.staffAttendance.findMany.mockResolvedValueOnce([
      { staffId: "staff-1", attendanceDate: new Date("2026-01-10T00:00:00.000Z"), status: "present", remarks: null },
      { staffId: "staff-1", attendanceDate: new Date("2026-01-11T00:00:00.000Z"), status: "half_day", remarks: "left early" },
    ]);

    const result = await service.getRosterRange("branch-1", "2026-01-01", "2026-01-31");

    expect(result).toEqual([
      {
        staff_id: "staff-1",
        first_name: "Asha",
        last_name: "Rao",
        designation: "Teacher",
        days: {
          "2026-01-10": { status: "present", remarks: null },
          "2026-01-11": { status: "half_day", remarks: "left early" },
        },
      },
      { staff_id: "staff-2", first_name: "Bilal", last_name: null, designation: "Clerk", days: {} },
    ]);
  });
});

describe("StaffAttendanceService.markAttendanceBulk", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: StaffAttendanceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new StaffAttendanceService(prisma, audit, schoolCalendar);
  });

  it("upserts one row per entry, each keyed by its own date, in one audited batch", async () => {
    prisma.__tx.staffAttendance.upsert.mockResolvedValue({});

    await service.markAttendanceBulk("tenant-1", "actor-1", {
      branch_id: "branch-1",
      entries: [
        { staff_id: "staff-1", attendance_date: "2026-01-10", status: "present" },
        { staff_id: "staff-1", attendance_date: "2026-01-11", status: "absent" },
        { staff_id: "staff-2", attendance_date: "2026-01-10", status: "present" },
      ],
    });

    expect(prisma.__tx.staffAttendance.upsert).toHaveBeenCalledTimes(3);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      prisma.__tx,
      expect.objectContaining({ tenantId: "tenant-1", entityTable: "staff_attendance", action: "update" }),
    );
  });
});
