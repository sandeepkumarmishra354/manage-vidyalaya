import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { QrTokenService } from "../qr/qr-token.service.js";
import type { SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import { StaffAttendanceService } from "./staff-attendance.service.js";

function makePrismaMock() {
  const tx = { staffAttendance: { upsert: vi.fn() } };
  return {
    // markAttendanceBulk uses the callback form; markAttendance passes an
    // array of promises (Prisma's array-form transaction) -- support both.
    $transaction: vi.fn(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(tx),
    ),
    __tx: tx,
    staff: { findMany: vi.fn(), findFirst: vi.fn() },
    staffAttendance: { findMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
  } as unknown as PrismaService & {
    __tx: typeof tx;
    staff: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    staffAttendance: {
      findMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
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
    service = new StaffAttendanceService(prisma, audit, schoolCalendar, new QrTokenService());
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
    service = new StaffAttendanceService(prisma, audit, schoolCalendar, new QrTokenService());
  });

  it("upserts one row per entry, each keyed by its own date, in one audited batch", async () => {
    prisma.staff.findMany.mockResolvedValueOnce([
      { id: "staff-1", status: "active", firstName: "Asha", lastName: null },
      { id: "staff-2", status: "active", firstName: "Bilal", lastName: null },
    ]);
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

  it("rejects an entry targeting a relieved staff member", async () => {
    prisma.staff.findMany.mockResolvedValueOnce([{ id: "staff-1", status: "relieved", firstName: "Asha", lastName: null }]);

    await expect(
      service.markAttendanceBulk("tenant-1", "actor-1", {
        branch_id: "branch-1",
        entries: [{ staff_id: "staff-1", attendance_date: "2026-01-10", status: "present" }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.__tx.staffAttendance.upsert).not.toHaveBeenCalled();
  });
});

describe("StaffAttendanceService.markAttendance", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: StaffAttendanceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new StaffAttendanceService(prisma, audit, schoolCalendar, new QrTokenService());
  });

  it("upserts one row per entry for the given date", async () => {
    prisma.staff.findMany.mockResolvedValueOnce([{ id: "staff-1", status: "active", firstName: "Asha", lastName: null }]);
    prisma.staffAttendance.upsert.mockResolvedValue({});

    await service.markAttendance("tenant-1", "actor-1", {
      branch_id: "branch-1",
      attendance_date: "2026-01-10",
      entries: [{ staff_id: "staff-1", status: "present" }],
    });

    expect(prisma.staffAttendance.upsert).toHaveBeenCalledTimes(1);
  });

  it("rejects an entry targeting a terminated staff member", async () => {
    prisma.staff.findMany.mockResolvedValueOnce([{ id: "staff-1", status: "terminated", firstName: "Asha", lastName: null }]);
    prisma.staffAttendance.upsert.mockResolvedValue({});

    await expect(
      service.markAttendance("tenant-1", "actor-1", {
        branch_id: "branch-1",
        attendance_date: "2026-01-10",
        entries: [{ staff_id: "staff-1", status: "present" }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.staffAttendance.upsert).not.toHaveBeenCalled();
  });
});

describe("StaffAttendanceService.scanMark", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let qrToken: QrTokenService;
  let service: StaffAttendanceService;

  const staff = {
    id: "staff-1",
    tenantId: "tenant-1",
    branchId: "branch-1",
    firstName: "Asha",
    lastName: "Rao",
    designation: "Teacher",
    status: "active",
    photoPath: null,
    qrCodeVersion: 1,
  };

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    qrToken = new QrTokenService();
    service = new StaffAttendanceService(prisma, audit, schoolCalendar, qrToken);

    (schoolCalendar.getDayType as ReturnType<typeof vi.fn>).mockResolvedValue("working");
  });

  it("marks a fresh scan as present and audits it", async () => {
    prisma.staff.findFirst.mockResolvedValueOnce(staff);
    prisma.staffAttendance.findUnique.mockResolvedValueOnce(null);
    prisma.__tx.staffAttendance.upsert.mockResolvedValueOnce({});

    const token = qrToken.generate("staff", "tenant-1", staff.id, staff.qrCodeVersion);
    const result = await service.scanMark("tenant-1", "actor-1", token);

    expect(result).toEqual(expect.objectContaining({ status: "marked", staff_id: "staff-1" }));
    expect(prisma.__tx.staffAttendance.upsert).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("is idempotent -- a second scan the same day never overwrites the existing record", async () => {
    prisma.staff.findFirst.mockResolvedValueOnce(staff);
    prisma.staffAttendance.findUnique.mockResolvedValueOnce({ status: "half_day", deletedAt: null });

    const token = qrToken.generate("staff", "tenant-1", staff.id, staff.qrCodeVersion);
    const result = await service.scanMark("tenant-1", "actor-1", token);

    expect(result).toEqual(
      expect.objectContaining({ status: "already_marked", existing_status: "half_day", staff_id: "staff-1" }),
    );
    expect(prisma.__tx.staffAttendance.upsert).not.toHaveBeenCalled();
  });

  it("rejects on a declared holiday", async () => {
    prisma.staff.findFirst.mockResolvedValueOnce(staff);
    (schoolCalendar.getDayType as ReturnType<typeof vi.fn>).mockResolvedValueOnce("holiday");

    const token = qrToken.generate("staff", "tenant-1", staff.id, staff.qrCodeVersion);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a relieved/terminated staff member", async () => {
    prisma.staff.findFirst.mockResolvedValueOnce({ ...staff, status: "relieved" });

    const token = qrToken.generate("staff", "tenant-1", staff.id, staff.qrCodeVersion);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a stale token after the staff member's QR code has been reissued", async () => {
    prisma.staff.findFirst.mockResolvedValueOnce({ ...staff, qrCodeVersion: 2 });

    const staleToken = qrToken.generate("staff", "tenant-1", staff.id, 1);
    await expect(service.scanMark("tenant-1", "actor-1", staleToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a student-type QR code", async () => {
    const token = qrToken.generate("student", "tenant-1", "student-1", 1);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.staff.findFirst).not.toHaveBeenCalled();
  });

  it("rejects when the staff member doesn't exist in this tenant", async () => {
    prisma.staff.findFirst.mockResolvedValueOnce(null);

    const token = qrToken.generate("staff", "tenant-1", "ghost-staff", 1);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(NotFoundException);
  });
});
