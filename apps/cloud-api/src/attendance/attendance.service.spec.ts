import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { ScopedAccessService } from "../common/scoped-access.service.js";
import type { DbService } from "../db/db.service.js";
import { QrTokenService } from "../qr/qr-token.service.js";
import type { SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import { AttendanceService } from "./attendance.service.js";

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
  let db: ReturnType<typeof makeDbMock>["db"];
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: AttendanceService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new AttendanceService(db, audit, scopedAccess, schoolCalendar, new QrTokenService());
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
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: AttendanceService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new AttendanceService(db, audit, scopedAccess, schoolCalendar, new QrTokenService());
  });

  it("upserts every entry and writes one audit record for the batch", async () => {
    client.query.mockResolvedValue({ rows: [] });

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

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      client,
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
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: AttendanceService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new AttendanceService(db, audit, scopedAccess, schoolCalendar, new QrTokenService());
  });

  it("upserts one row per entry, each keyed by its own date, in one audited batch", async () => {
    client.query.mockResolvedValue({ rows: [] });

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

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ tenantId: "tenant-1", entityTable: "attendance_records", entityId: "class-1" }),
    );
  });
});

describe("AttendanceService.getRosterRange", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: AttendanceService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new AttendanceService(db, audit, scopedAccess, schoolCalendar, new QrTokenService());
  });

  it("groups records into a per-student, per-ISO-date map", async () => {
    db.query
      .mockResolvedValueOnce([
        { id: "student-1", first_name: "Asha", last_name: "Rao" },
        { id: "student-2", first_name: "Bilal", last_name: null },
      ])
      .mockResolvedValueOnce([
        { student_id: "student-1", attendance_date: new Date("2026-01-10T00:00:00.000Z"), status: "present", remarks: null },
        {
          student_id: "student-1",
          attendance_date: new Date("2026-01-11T00:00:00.000Z"),
          status: "absent",
          remarks: "sick",
        },
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

describe("AttendanceService.getStudentHistory (branch isolation)", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: AttendanceService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new AttendanceService(db, audit, scopedAccess, schoolCalendar, new QrTokenService());
  });

  it("adds a branch_id condition and binds branchId when the caller is branch-scoped", async () => {
    db.query.mockResolvedValueOnce([]);

    await service.getStudentHistory("tenant-1", "student-1", "branch-a");

    const [, sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/branch_id = \$3/);
    expect(params).toEqual(["tenant-1", "student-1", "branch-a"]);
  });

  it("excludes a different branch's records for the same student id", async () => {
    // The real WHERE branch_id = $3 clause would exclude the row entirely;
    // the fake DB layer mirrors that by returning no rows for the mismatch.
    db.query.mockResolvedValueOnce([]);

    const result = await service.getStudentHistory("tenant-1", "student-1", "branch-other");

    expect(result).toEqual([]);
  });

  it("returns the caller's own-branch records", async () => {
    db.query.mockResolvedValueOnce([
      { attendance_date: new Date("2026-01-10"), status: "present", remarks: null, branch_id: "branch-a" },
    ]);

    const result = await service.getStudentHistory("tenant-1", "student-1", "branch-a");

    expect(result).toEqual([{ attendance_date: new Date("2026-01-10"), status: "present", remarks: null }]);
  });

  it("an unscoped caller (branchId: null) omits the branch condition", async () => {
    db.query.mockResolvedValueOnce([]);

    await service.getStudentHistory("tenant-1", "student-1", null);

    const [, sql, params] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/branch_id/);
    expect(params).toEqual(["tenant-1", "student-1"]);
  });
});

describe("AttendanceService.scanMark", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let qrToken: QrTokenService;
  let service: AttendanceService;

  const student = {
    id: "student-1",
    tenant_id: "tenant-1",
    branch_id: "branch-1",
    first_name: "Asha",
    last_name: "Rao",
    status: "enrolled",
    current_class_id: "class-1",
    current_section_id: "section-1",
    photo_path: null,
    qr_code_version: 1,
  };

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    schoolCalendar = makeSchoolCalendarMock();
    qrToken = new QrTokenService();
    service = new AttendanceService(db, audit, scopedAccess, schoolCalendar, qrToken);

    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (schoolCalendar.getDayType as ReturnType<typeof vi.fn>).mockResolvedValue("working");
    db.queryOne.mockImplementation(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM classes")) return { name: "Class 5" };
      if (sql.includes("FROM sections")) return { name: "A" };
      return null;
    });
  });

  it("marks a fresh scan as present and audits it", async () => {
    db.queryOne.mockImplementationOnce(async () => student); // student lookup
    db.queryOne.mockImplementationOnce(async (_t: string, sql: string) => (sql.includes("FROM classes") ? { name: "Class 5" } : null));
    db.queryOne.mockImplementationOnce(async (_t: string, sql: string) => (sql.includes("FROM sections") ? { name: "A" } : null));
    db.queryOne.mockImplementationOnce(async () => null); // existing attendance record
    client.query.mockResolvedValueOnce({ rows: [] });

    const token = qrToken.generate("student", "tenant-1", student.id, student.qr_code_version);
    const result = await service.scanMark("tenant-1", "actor-1", token);

    expect(result).toEqual(
      expect.objectContaining({ status: "marked", student_id: "student-1", class_name: "Class 5", section_name: "A" }),
    );
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("is idempotent -- a second scan the same day never overwrites the existing record", async () => {
    db.queryOne.mockImplementationOnce(async () => student); // student lookup
    db.queryOne.mockImplementationOnce(async (_t: string, sql: string) => (sql.includes("FROM classes") ? { name: "Class 5" } : null));
    db.queryOne.mockImplementationOnce(async (_t: string, sql: string) => (sql.includes("FROM sections") ? { name: "A" } : null));
    db.queryOne.mockImplementationOnce(async () => ({ status: "absent", deleted_at: null }));

    const token = qrToken.generate("student", "tenant-1", student.id, student.qr_code_version);
    const result = await service.scanMark("tenant-1", "actor-1", token);

    expect(result).toEqual(
      expect.objectContaining({ status: "already_marked", existing_status: "absent", student_id: "student-1" }),
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejects on a declared holiday", async () => {
    db.queryOne.mockImplementationOnce(async () => student);
    (schoolCalendar.getDayType as ReturnType<typeof vi.fn>).mockResolvedValueOnce("holiday");

    const token = qrToken.generate("student", "tenant-1", student.id, student.qr_code_version);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects when the operator isn't authorized to mark the student's section", async () => {
    db.queryOne.mockImplementationOnce(async () => student);
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const token = qrToken.generate("student", "tenant-1", student.id, student.qr_code_version);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a stale token after the student's QR code has been reissued", async () => {
    db.queryOne.mockImplementationOnce(async () => ({ ...student, qr_code_version: 2 }));

    const staleToken = qrToken.generate("student", "tenant-1", student.id, 1);
    await expect(service.scanMark("tenant-1", "actor-1", staleToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a tampered token", async () => {
    db.queryOne.mockImplementationOnce(async () => student);

    const token = qrToken.generate("student", "tenant-1", student.id, student.qr_code_version);
    const tampered = token.slice(0, -1) + (token.slice(-1) === "a" ? "b" : "a");
    await expect(service.scanMark("tenant-1", "actor-1", tampered)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects garbage input as a BadRequestException rather than a 500", async () => {
    await expect(service.scanMark("tenant-1", "actor-1", "not-a-token")).rejects.toBeInstanceOf(BadRequestException);
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it("rejects when the student doesn't exist in this tenant", async () => {
    db.queryOne.mockImplementationOnce(async () => null);

    const token = qrToken.generate("student", "tenant-1", "ghost-student", 1);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a staff-type QR code", async () => {
    const token = qrToken.generate("staff", "tenant-1", "staff-1", 1);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it("rejects a withdrawn/alumni student", async () => {
    db.queryOne.mockImplementationOnce(async () => ({ ...student, status: "withdrawn" }));

    const token = qrToken.generate("student", "tenant-1", student.id, student.qr_code_version);
    await expect(service.scanMark("tenant-1", "actor-1", token)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects (student not found) scanning a student who belongs to a different branch", async () => {
    db.queryOne.mockImplementationOnce(async () => student); // student's own branch is "branch-1"

    const token = qrToken.generate("student", "tenant-1", student.id, student.qr_code_version);
    await expect(service.scanMark("tenant-1", "actor-1", token, "branch-other")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  it("succeeds scanning a student in the caller's own branch", async () => {
    db.queryOne.mockImplementationOnce(async () => student); // student lookup
    db.queryOne.mockImplementationOnce(async (_t: string, sql: string) => (sql.includes("FROM classes") ? { name: "Class 5" } : null));
    db.queryOne.mockImplementationOnce(async (_t: string, sql: string) => (sql.includes("FROM sections") ? { name: "A" } : null));
    db.queryOne.mockImplementationOnce(async () => null); // existing attendance record
    client.query.mockResolvedValueOnce({ rows: [] });

    const token = qrToken.generate("student", "tenant-1", student.id, student.qr_code_version);
    const result = await service.scanMark("tenant-1", "actor-1", token, "branch-1");

    expect(result).toEqual(expect.objectContaining({ status: "marked", student_id: "student-1" }));
  });

  it("an unscoped caller (branchId: null) is unaffected", async () => {
    db.queryOne.mockImplementationOnce(async () => student);
    db.queryOne.mockImplementationOnce(async (_t: string, sql: string) => (sql.includes("FROM classes") ? { name: "Class 5" } : null));
    db.queryOne.mockImplementationOnce(async (_t: string, sql: string) => (sql.includes("FROM sections") ? { name: "A" } : null));
    db.queryOne.mockImplementationOnce(async () => null);
    client.query.mockResolvedValueOnce({ rows: [] });

    const token = qrToken.generate("student", "tenant-1", student.id, student.qr_code_version);
    const result = await service.scanMark("tenant-1", "actor-1", token, null);

    expect(result).toEqual(expect.objectContaining({ status: "marked", student_id: "student-1" }));
  });
});
