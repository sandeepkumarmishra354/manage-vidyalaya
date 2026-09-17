import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { ScopedAccessService } from "../common/scoped-access.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { QrTokenService } from "../qr/qr-token.service.js";
import type { SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import { AttendanceService } from "./attendance.service.js";

function makePrismaMock() {
  const tx = { attendanceRecord: { upsert: vi.fn() } };
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
    student: { findMany: vi.fn(), findFirst: vi.fn() },
    attendanceRecord: { findMany: vi.fn(), findUnique: vi.fn() },
  } as unknown as PrismaService & {
    __tx: typeof tx;
    student: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    attendanceRecord: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

function makeScopedAccessMock() {
  return {
    hasPermission: vi.fn(),
    getActingStaff: vi.fn(),
    isClassTeacherOfSection: vi.fn(),
    isAssignedToSubject: vi.fn(),
  } as unknown as ScopedAccessService & Record<string, ReturnType<typeof vi.fn>>;
}

function makeSchoolCalendarMock() {
  return { getDayTypesInRange: vi.fn(async () => ({})), getDayType: vi.fn() } as unknown as SchoolCalendarService;
}

describe("AttendanceService.assertCanView / assertCanMark", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: AttendanceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new AttendanceService(prisma, audit, scopedAccess, schoolCalendar, new QrTokenService());
  });

  it("allows a broad attendance.mark holder to mark any section", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    await expect(service.assertCanMark("tenant-1", "user-1", "section-x")).resolves.toBeUndefined();
    expect(scopedAccess.getActingStaff).not.toHaveBeenCalled();
  });

  it("allows a class teacher to mark their own section without attendance.mark", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
    (scopedAccess.isClassTeacherOfSection as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

    await expect(service.assertCanMark("tenant-1", "user-1", "section-a")).resolves.toBeUndefined();
  });

  it("rejects a class teacher marking a section that isn't theirs", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
    (scopedAccess.isClassTeacherOfSection as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    await expect(service.assertCanMark("tenant-1", "user-1", "section-b")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("rejects with no permission and no section_id (nothing to scope the class-teacher check against)", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    await expect(service.assertCanMark("tenant-1", "user-1", undefined)).rejects.toBeInstanceOf(ForbiddenException);
    expect(scopedAccess.getActingStaff).not.toHaveBeenCalled();
  });

  it("rejects a user who isn't linked to any staff row", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(service.assertCanMark("tenant-1", "user-1", "section-a")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("applies the same additive logic to assertCanView", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
    (scopedAccess.isClassTeacherOfSection as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

    await expect(service.assertCanView("tenant-1", "user-1", "section-a")).resolves.toBeUndefined();
  });
});

describe("AttendanceService.markAttendance", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: AttendanceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new AttendanceService(prisma, audit, scopedAccess, schoolCalendar, new QrTokenService());
  });

  it("upserts every entry and writes one audit record for the batch", async () => {
    prisma.__tx.attendanceRecord.upsert.mockResolvedValue({});

    await service.markAttendance("tenant-1", "actor-1", {
      branch_id: "branch-1",
      class_id: "class-1",
      section_id: "section-1",
      attendance_date: "2026-01-15",
      entries: [
        { student_id: "student-1", status: "present" },
        { student_id: "student-2", status: "absent" },
      ],
    });

    expect(prisma.__tx.attendanceRecord.upsert).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      prisma.__tx,
      expect.objectContaining({
        tenantId: "tenant-1",
        entityTable: "attendance_records",
        entityId: "class-1",
        action: "update",
      }),
    );
  });
});

describe("AttendanceService.markAttendanceBulk", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: AttendanceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new AttendanceService(prisma, audit, scopedAccess, schoolCalendar, new QrTokenService());
  });

  it("upserts one row per entry, each keyed by its own date, in one audited batch", async () => {
    prisma.__tx.attendanceRecord.upsert.mockResolvedValue({});

    await service.markAttendanceBulk("tenant-1", "actor-1", {
      branch_id: "branch-1",
      class_id: "class-1",
      section_id: "section-1",
      entries: [
        { student_id: "student-1", attendance_date: "2026-01-10", status: "present" },
        { student_id: "student-1", attendance_date: "2026-01-11", status: "absent" },
        { student_id: "student-2", attendance_date: "2026-01-10", status: "present" },
      ],
    });

    expect(prisma.__tx.attendanceRecord.upsert).toHaveBeenCalledTimes(3);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      prisma.__tx,
      expect.objectContaining({ tenantId: "tenant-1", entityTable: "attendance_records", entityId: "class-1" }),
    );
  });
});

describe("AttendanceService.getRosterRange", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: AttendanceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new AttendanceService(prisma, audit, scopedAccess, schoolCalendar, new QrTokenService());
  });

  it("groups records into a per-student, per-ISO-date map", async () => {
    prisma.student.findMany.mockResolvedValueOnce([
      { id: "student-1", firstName: "Asha", lastName: "Rao" },
      { id: "student-2", firstName: "Bilal", lastName: null },
    ]);
    prisma.attendanceRecord.findMany.mockResolvedValueOnce([
      { studentId: "student-1", attendanceDate: new Date("2026-01-10T00:00:00.000Z"), status: "present", remarks: null },
      { studentId: "student-1", attendanceDate: new Date("2026-01-11T00:00:00.000Z"), status: "absent", remarks: "sick" },
    ]);

    const result = await service.getRosterRange(
      "tenant-1",
      "branch-1",
      "class-1",
      "section-1",
      "2026-01-01",
      "2026-01-31",
    );

    expect(result).toEqual([
      {
        student_id: "student-1",
        first_name: "Asha",
        last_name: "Rao",
        days: {
          "2026-01-10": { status: "present", remarks: null },
          "2026-01-11": { status: "absent", remarks: "sick" },
        },
      },
      { student_id: "student-2", first_name: "Bilal", last_name: null, days: {} },
    ]);
  });
});

describe("AttendanceService.scanMark", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let qrToken: QrTokenService;
  let service: AttendanceService;

  const student = {
    id: "student-1",
    tenantId: "tenant-1",
    branchId: "branch-1",
    firstName: "Asha",
    lastName: "Rao",
    status: "enrolled",
    currentClassId: "class-1",
    currentSectionId: "section-1",
    currentClass: { name: "Class 5" },
    currentSection: { name: "A" },
    photoPath: null,
    qrCodeVersion: 1,
  };

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    schoolCalendar = makeSchoolCalendarMock();
    qrToken = new QrTokenService();
    service = new AttendanceService(prisma, audit, scopedAccess, schoolCalendar, qrToken);

    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (schoolCalendar.getDayType as ReturnType<typeof vi.fn>).mockResolvedValue("working");
  });

  it("marks a fresh scan as present and audits it", async () => {
    prisma.student.findFirst.mockResolvedValueOnce(student);
    prisma.attendanceRecord.findUnique.mockResolvedValueOnce(null);
    prisma.__tx.attendanceRecord.upsert.mockResolvedValueOnce({});

    const token = qrToken.generate("student", "tenant-1", student.id, student.qrCodeVersion);
    const result = await service.scanMark("tenant-1", "actor-1", token);

    expect(result).toEqual(
      expect.objectContaining({ status: "marked", student_id: "student-1", class_name: "Class 5", section_name: "A" }),
    );
    expect(prisma.__tx.attendanceRecord.upsert).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("is idempotent -- a second scan the same day never overwrites the existing record", async () => {
    prisma.student.findFirst.mockResolvedValueOnce(student);
    prisma.attendanceRecord.findUnique.mockResolvedValueOnce({ status: "absent", deletedAt: null });

    const token = qrToken.generate("student", "tenant-1", student.id, student.qrCodeVersion);
    const result = await service.scanMark("tenant-1", "actor-1", token);

    expect(result).toEqual(
      expect.objectContaining({ status: "already_marked", existing_status: "absent", student_id: "student-1" }),
    );
    expect(prisma.__tx.attendanceRecord.upsert).not.toHaveBeenCalled();
  });

  it("rejects on a declared holiday", async () => {
    prisma.student.findFirst.mockResolvedValueOnce(student);
    (schoolCalendar.getDayType as ReturnType<typeof vi.fn>).mockResolvedValueOnce("holiday");

    const token = qrToken.generate("student", "tenant-1", student.id, student.qrCodeVersion);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects when the operator isn't authorized to mark the student's section", async () => {
    prisma.student.findFirst.mockResolvedValueOnce(student);
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const token = qrToken.generate("student", "tenant-1", student.id, student.qrCodeVersion);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a stale token after the student's QR code has been reissued", async () => {
    prisma.student.findFirst.mockResolvedValueOnce({ ...student, qrCodeVersion: 2 });

    const staleToken = qrToken.generate("student", "tenant-1", student.id, 1);
    await expect(service.scanMark("tenant-1", "actor-1", staleToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a tampered token", async () => {
    prisma.student.findFirst.mockResolvedValueOnce(student);

    const token = qrToken.generate("student", "tenant-1", student.id, student.qrCodeVersion);
    const tampered = token.slice(0, -1) + (token.slice(-1) === "a" ? "b" : "a");
    await expect(service.scanMark("tenant-1", "actor-1", tampered)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects garbage input as a BadRequestException rather than a 500", async () => {
    await expect(service.scanMark("tenant-1", "actor-1", "not-a-token")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
  });

  it("rejects when the student doesn't exist in this tenant", async () => {
    prisma.student.findFirst.mockResolvedValueOnce(null);

    const token = qrToken.generate("student", "tenant-1", "ghost-student", 1);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a staff-type QR code", async () => {
    const token = qrToken.generate("staff", "tenant-1", "staff-1", 1);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a withdrawn/alumni student", async () => {
    prisma.student.findFirst.mockResolvedValueOnce({ ...student, status: "withdrawn" });

    const token = qrToken.generate("student", "tenant-1", student.id, student.qrCodeVersion);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(BadRequestException);
  });
});
