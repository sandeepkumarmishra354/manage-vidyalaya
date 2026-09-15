import { ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { ScopedAccessService } from "../common/scoped-access.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { AttendanceService } from "./attendance.service.js";

function makePrismaMock() {
  const tx = { attendanceRecord: { upsert: vi.fn() } };
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
    student: { findMany: vi.fn() },
    attendanceRecord: { findMany: vi.fn() },
  } as unknown as PrismaService & {
    __tx: typeof tx;
    student: { findMany: ReturnType<typeof vi.fn> };
    attendanceRecord: { findMany: ReturnType<typeof vi.fn> };
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

describe("AttendanceService.assertCanView / assertCanMark", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let service: AttendanceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    service = new AttendanceService(prisma, audit, scopedAccess);
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
  let service: AttendanceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    service = new AttendanceService(prisma, audit, scopedAccess);
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
  let service: AttendanceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    service = new AttendanceService(prisma, audit, scopedAccess);
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
  let service: AttendanceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    service = new AttendanceService(prisma, audit, scopedAccess);
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
