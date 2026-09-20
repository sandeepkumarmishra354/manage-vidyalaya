import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { QrTokenService } from "../qr/qr-token.service.js";
import type { SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import { StaffAttendanceService } from "./staff-attendance.service.js";

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

function makeSchoolCalendarMock() {
  return { getDayTypesInRange: vi.fn(async () => ({})), getDayType: vi.fn() } as unknown as SchoolCalendarService;
}

describe("StaffAttendanceService.getRosterRange", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let audit: ReturnType<typeof makeAuditMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: StaffAttendanceService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new StaffAttendanceService(db, audit, schoolCalendar, new QrTokenService());
  });

  it("groups records into a per-staff, per-ISO-date map", async () => {
    db.query
      .mockResolvedValueOnce([
        { id: "staff-1", first_name: "Asha", last_name: "Rao", designation: "Teacher" },
        { id: "staff-2", first_name: "Bilal", last_name: null, designation: "Clerk" },
      ])
      .mockResolvedValueOnce([
        { staff_id: "staff-1", attendance_date: new Date("2026-01-10T00:00:00.000Z"), status: "present", remarks: null },
        {
          staff_id: "staff-1",
          attendance_date: new Date("2026-01-11T00:00:00.000Z"),
          status: "half_day",
          remarks: "left early",
        },
      ]);

    const result = await service.getRosterRange("tenant-1", "branch-1", "2026-01-01", "2026-01-31");

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
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: StaffAttendanceService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new StaffAttendanceService(db, audit, schoolCalendar, new QrTokenService());
  });

  it("upserts one row per entry, each keyed by its own date, in one audited batch", async () => {
    db.query.mockResolvedValueOnce([
      { id: "staff-1", status: "active", first_name: "Asha", last_name: null },
      { id: "staff-2", status: "active", first_name: "Bilal", last_name: null },
    ]);
    client.query.mockResolvedValue({ rows: [] });

    await service.markAttendanceBulk("tenant-1", "actor-1", {
      branch_id: "branch-1",
      entries: [
        { staff_id: "staff-1", attendance_date: "2026-01-10", status: "present" },
        { staff_id: "staff-1", attendance_date: "2026-01-11", status: "absent" },
        { staff_id: "staff-2", attendance_date: "2026-01-10", status: "present" },
      ],
    });

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[0][0]).toContain("ON CONFLICT (tenant_id, staff_id, attendance_date)");
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ tenantId: "tenant-1", entityTable: "staff_attendance", action: "update" }),
    );
  });

  it("rejects an entry targeting a relieved staff member", async () => {
    db.query.mockResolvedValueOnce([{ id: "staff-1", status: "relieved", first_name: "Asha", last_name: null }]);

    await expect(
      service.markAttendanceBulk("tenant-1", "actor-1", {
        branch_id: "branch-1",
        entries: [{ staff_id: "staff-1", attendance_date: "2026-01-10", status: "present" }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejects an entry targeting a staff_id that isn't in this tenant", async () => {
    db.query.mockResolvedValueOnce([]);

    await expect(
      service.markAttendanceBulk("tenant-1", "actor-1", {
        branch_id: "branch-1",
        entries: [{ staff_id: "outsider-staff", attendance_date: "2026-01-10", status: "present" }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(client.query).not.toHaveBeenCalled();
  });
});

describe("StaffAttendanceService.markAttendance", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: StaffAttendanceService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new StaffAttendanceService(db, audit, schoolCalendar, new QrTokenService());
  });

  it("upserts one row per entry for the given date", async () => {
    db.query.mockResolvedValueOnce([{ id: "staff-1", status: "active", first_name: "Asha", last_name: null }]);
    client.query.mockResolvedValue({ rows: [] });

    await service.markAttendance("tenant-1", "actor-1", {
      branch_id: "branch-1",
      attendance_date: "2026-01-10",
      entries: [{ staff_id: "staff-1", status: "present" }],
    });

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("rejects an entry targeting a terminated staff member", async () => {
    db.query.mockResolvedValueOnce([{ id: "staff-1", status: "terminated", first_name: "Asha", last_name: null }]);

    await expect(
      service.markAttendance("tenant-1", "actor-1", {
        branch_id: "branch-1",
        attendance_date: "2026-01-10",
        entries: [{ staff_id: "staff-1", status: "present" }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query).not.toHaveBeenCalled();
  });
});

describe("StaffAttendanceService.scanMark", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let qrToken: QrTokenService;
  let service: StaffAttendanceService;

  const staff = {
    id: "staff-1",
    tenant_id: "tenant-1",
    branch_id: "branch-1",
    first_name: "Asha",
    last_name: "Rao",
    designation: "Teacher",
    status: "active",
    photo_path: null,
    qr_code_version: 1,
  };

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    qrToken = new QrTokenService();
    service = new StaffAttendanceService(db, audit, schoolCalendar, qrToken);

    (schoolCalendar.getDayType as ReturnType<typeof vi.fn>).mockResolvedValue("working");
  });

  it("marks a fresh scan as present and audits it", async () => {
    db.queryOne.mockResolvedValueOnce(staff).mockResolvedValueOnce(null);
    client.query.mockResolvedValueOnce({ rows: [] });

    const token = qrToken.generate("staff", "tenant-1", staff.id, staff.qr_code_version);
    const result = await service.scanMark("tenant-1", "actor-1", token, null);

    expect(result).toEqual(expect.objectContaining({ status: "marked", staff_id: "staff-1" }));
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("is idempotent -- a second scan the same day never overwrites the existing record", async () => {
    db.queryOne
      .mockResolvedValueOnce(staff)
      .mockResolvedValueOnce({ status: "half_day", deleted_at: null });

    const token = qrToken.generate("staff", "tenant-1", staff.id, staff.qr_code_version);
    const result = await service.scanMark("tenant-1", "actor-1", token, null);

    expect(result).toEqual(
      expect.objectContaining({ status: "already_marked", existing_status: "half_day", staff_id: "staff-1" }),
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejects on a declared holiday", async () => {
    db.queryOne.mockResolvedValueOnce(staff);
    (schoolCalendar.getDayType as ReturnType<typeof vi.fn>).mockResolvedValueOnce("holiday");

    const token = qrToken.generate("staff", "tenant-1", staff.id, staff.qr_code_version);
    await expect(service.scanMark("tenant-1", "actor-1", token, null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a relieved/terminated staff member", async () => {
    db.queryOne.mockResolvedValueOnce({ ...staff, status: "relieved" });

    const token = qrToken.generate("staff", "tenant-1", staff.id, staff.qr_code_version);
    await expect(service.scanMark("tenant-1", "actor-1", token, null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a stale token after the staff member's QR code has been reissued", async () => {
    db.queryOne.mockResolvedValueOnce({ ...staff, qr_code_version: 2 });

    const staleToken = qrToken.generate("staff", "tenant-1", staff.id, 1);
    await expect(service.scanMark("tenant-1", "actor-1", staleToken, null)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a student-type QR code", async () => {
    const token = qrToken.generate("student", "tenant-1", "student-1", 1);
    await expect(service.scanMark("tenant-1", "actor-1", token, null)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it("rejects when the staff member doesn't exist in this tenant", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    const token = qrToken.generate("staff", "tenant-1", "ghost-staff", 1);
    await expect(service.scanMark("tenant-1", "actor-1", token, null)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// Phase 2: branch isolation. `staff` and `staff_attendance` both carry their
// own branch_id, so scanMark's staff lookup and getStaffHistory's records
// query fold a branch_id condition into their SQL when the caller is
// branch-scoped, reading as "not found"/empty for anything outside it. An
// unscoped caller is unaffected.
describe("StaffAttendanceService branch isolation", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let audit: ReturnType<typeof makeAuditMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let qrToken: QrTokenService;
  let service: StaffAttendanceService;

  const staff = {
    id: "staff-1",
    tenant_id: "tenant-1",
    branch_id: "branch-1",
    first_name: "Asha",
    last_name: "Rao",
    designation: "Teacher",
    status: "active",
    photo_path: null,
    qr_code_version: 1,
  };

  beforeEach(() => {
    ({ db } = makeDbMock());
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    qrToken = new QrTokenService();
    service = new StaffAttendanceService(db, audit, schoolCalendar, qrToken);
    (schoolCalendar.getDayType as ReturnType<typeof vi.fn>).mockResolvedValue("working");
  });

  describe("scanMark", () => {
    it("folds a branch_id condition into the staff lookup when branch-scoped", async () => {
      db.queryOne.mockResolvedValueOnce(null); // simulates a different-branch staff row being filtered out

      const token = qrToken.generate("staff", "tenant-1", staff.id, staff.qr_code_version);
      await expect(service.scanMark("tenant-1", "actor-1", token, "branch-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );

      const [, sql, params] = db.queryOne.mock.calls[0];
      expect(sql).toContain("branch_id = $3");
      expect(params).toEqual([staff.id, "tenant-1", "branch-1"]);
    });

    it("adds no branch_id condition for an unscoped caller", async () => {
      db.queryOne.mockResolvedValueOnce(staff);

      const token = qrToken.generate("staff", "tenant-1", staff.id, staff.qr_code_version);
      await service.scanMark("tenant-1", "actor-1", token, null);

      const [, sql, params] = db.queryOne.mock.calls[0];
      expect(sql).not.toContain("branch_id");
      expect(params).toEqual([staff.id, "tenant-1"]);
    });
  });

  describe("getStaffHistory", () => {
    it("folds a branch_id condition into the query when branch-scoped", async () => {
      db.query.mockResolvedValueOnce([]);

      await service.getStaffHistory("tenant-1", "staff-1", "branch-1");

      const [, sql, params] = db.query.mock.calls[0];
      expect(sql).toContain("branch_id = $3");
      expect(params).toEqual(["tenant-1", "staff-1", "branch-1"]);
    });

    it("adds no branch_id condition for an unscoped caller", async () => {
      db.query.mockResolvedValueOnce([]);

      await service.getStaffHistory("tenant-1", "staff-1", null);

      const [, sql, params] = db.query.mock.calls[0];
      expect(sql).not.toContain("branch_id");
      expect(params).toEqual(["tenant-1", "staff-1"]);
    });
  });
});
