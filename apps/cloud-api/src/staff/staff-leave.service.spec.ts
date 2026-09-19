import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { ScopedAccessService } from "../common/scoped-access.service.js";
import type { DbService } from "../db/db.service.js";
import { StaffLeaveService } from "./staff-leave.service.js";

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
  return { getActingStaff: vi.fn() } as unknown as ScopedAccessService & { getActingStaff: ReturnType<typeof vi.fn> };
}

describe("StaffLeaveService.apply", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let service: StaffLeaveService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    service = new StaffLeaveService(db, audit, scopedAccess);
  });

  it("creates a pending request for the caller's own linked staff row", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branch_id: "branch-1", status: "active" });
    client.query.mockResolvedValueOnce({ rows: [{ id: "req-1", status: "pending", tenant_id: "tenant-1" }] });

    await service.apply("tenant-1", "user-1", { start_date: "2026-04-10", end_date: "2026-04-12", reason: "wedding" });

    const [, params] = client.query.mock.calls[0];
    expect(params).toContain("staff-1");
    expect(params).toContain("branch-1");
    expect(params).toContain("pending");
    expect(params).toContain("user-1");
  });

  it("rejects when the logged-in user has no linked staff record", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce(null);

    await expect(
      service.apply("tenant-1", "user-1", { start_date: "2026-04-10", end_date: "2026-04-12" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejects an end date before the start date", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branch_id: "branch-1", status: "active" });

    await expect(
      service.apply("tenant-1", "user-1", { start_date: "2026-04-12", end_date: "2026-04-10" }),
    ).rejects.toThrow();
  });

  it("allows an on_leave staff member to apply", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branch_id: "branch-1", status: "on_leave" });
    client.query.mockResolvedValueOnce({ rows: [{ id: "req-1", status: "pending", tenant_id: "tenant-1" }] });

    await service.apply("tenant-1", "user-1", { start_date: "2026-04-10", end_date: "2026-04-12" });

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("rejects a relieved staff member", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branch_id: "branch-1", status: "relieved" });

    await expect(
      service.apply("tenant-1", "user-1", { start_date: "2026-04-10", end_date: "2026-04-12" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejects a half-day request spanning more than one date", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branch_id: "branch-1", status: "active" });

    await expect(
      service.apply("tenant-1", "user-1", { start_date: "2026-04-10", end_date: "2026-04-12", is_half_day: true }),
    ).rejects.toThrow();
    expect(client.query).not.toHaveBeenCalled();
  });

  it("accepts a half-day request for a single date and records it on the row", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branch_id: "branch-1", status: "active" });
    client.query.mockResolvedValueOnce({ rows: [{ id: "req-1", status: "pending", tenant_id: "tenant-1" }] });

    await service.apply("tenant-1", "user-1", { start_date: "2026-04-10", end_date: "2026-04-10", is_half_day: true });

    const [, params] = client.query.mock.calls[0];
    expect(params).toContain(true);
  });
});

describe("StaffLeaveService.cancel", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let service: StaffLeaveService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    service = new StaffLeaveService(db, audit, scopedAccess);
  });

  it("cancels the caller's own pending request", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branch_id: "branch-1" });
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "req-1", tenant_id: "tenant-1", staff_id: "staff-1", status: "pending" }] })
      .mockResolvedValueOnce({ rows: [{ id: "req-1", tenant_id: "tenant-1", status: "cancelled" }] });

    await service.cancel("tenant-1", "user-1", "req-1");

    expect(client.query.mock.calls[1][0]).toContain("UPDATE staff_leave_requests");
    const [, params] = client.query.mock.calls[1];
    expect(params).toContain("cancelled");
  });

  it("blocks cancelling a request that isn't pending", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branch_id: "branch-1" });
    client.query.mockResolvedValueOnce({
      rows: [{ id: "req-1", tenant_id: "tenant-1", staff_id: "staff-1", status: "approved" }],
    });

    await expect(service.cancel("tenant-1", "user-1", "req-1")).rejects.toThrow();
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("404s when the request isn't the caller's own", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branch_id: "branch-1" });
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.cancel("tenant-1", "user-1", "req-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("404s when the request belongs to a different staff member", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branch_id: "branch-1" });
    client.query.mockResolvedValueOnce({
      rows: [{ id: "req-1", tenant_id: "tenant-1", staff_id: "someone-else", status: "pending" }],
    });

    await expect(service.cancel("tenant-1", "user-1", "req-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("StaffLeaveService.file (HR on-behalf)", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let service: StaffLeaveService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    service = new StaffLeaveService(db, audit, scopedAccess);
  });

  it("creates the request already approved and writes attendance for every date in range", async () => {
    client.query.mockImplementation(async (text: unknown) => {
      if (typeof text === "string" && text.includes("FROM staff WHERE")) {
        return { rows: [{ id: "staff-1", branch_id: "branch-1", first_name: "Asha", last_name: "Rao", status: "active" }] };
      }
      if (typeof text === "string" && text.startsWith("INSERT INTO staff_leave_requests")) {
        return { rows: [{ id: "req-1", status: "approved", tenant_id: "tenant-1" }] };
      }
      return { rows: [] };
    });

    await service.file("tenant-1", "hr-1", {
      staff_id: "staff-1",
      start_date: "2026-04-10",
      end_date: "2026-04-12",
    });

    const attendanceCalls = client.query.mock.calls.filter(
      ([text]) => typeof text === "string" && text.includes("INSERT INTO staff_attendance"),
    );
    // 3 inclusive days: 10, 11, 12 April.
    expect(attendanceCalls).toHaveLength(3);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("404s when the target staff member doesn't exist", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.file("tenant-1", "hr-1", { staff_id: "missing", start_date: "2026-04-10", end_date: "2026-04-12" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects filing leave for a terminated staff member", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "staff-1", branch_id: "branch-1", first_name: "Asha", last_name: "Rao", status: "terminated" }],
    });

    await expect(
      service.file("tenant-1", "hr-1", { staff_id: "staff-1", start_date: "2026-04-10", end_date: "2026-04-12" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});

describe("StaffLeaveService.decide", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let service: StaffLeaveService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    service = new StaffLeaveService(db, audit, scopedAccess);
  });

  it("approving writes a staff_attendance 'leave' row for every date in the range", async () => {
    client.query.mockImplementation(async (text: unknown) => {
      if (typeof text === "string" && text.includes("FROM staff_leave_requests lr")) {
        return {
          rows: [
            {
              id: "req-1",
              status: "pending",
              tenant_id: "tenant-1",
              branch_id: "branch-1",
              staff_id: "staff-1",
              start_date: new Date("2026-04-10T00:00:00.000Z"),
              end_date: new Date("2026-04-11T00:00:00.000Z"),
              staff_first_name: "Asha",
              staff_last_name: "Rao",
            },
          ],
        };
      }
      if (typeof text === "string" && text.startsWith("UPDATE staff_leave_requests")) {
        return { rows: [{ id: "req-1", status: "approved", tenant_id: "tenant-1" }] };
      }
      return { rows: [] };
    });

    await service.decide("tenant-1", "hr-1", "req-1", { decision: "approved" });

    const attendanceCalls = client.query.mock.calls.filter(
      ([text]) => typeof text === "string" && text.includes("INSERT INTO staff_attendance"),
    );
    expect(attendanceCalls).toHaveLength(2);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("rejecting writes no attendance", async () => {
    client.query.mockImplementation(async (text: unknown) => {
      if (typeof text === "string" && text.includes("FROM staff_leave_requests lr")) {
        return {
          rows: [
            {
              id: "req-1",
              status: "pending",
              tenant_id: "tenant-1",
              branch_id: "branch-1",
              staff_id: "staff-1",
              start_date: new Date("2026-04-10T00:00:00.000Z"),
              end_date: new Date("2026-04-11T00:00:00.000Z"),
              staff_first_name: "Asha",
              staff_last_name: "Rao",
            },
          ],
        };
      }
      if (typeof text === "string" && text.startsWith("UPDATE staff_leave_requests")) {
        return { rows: [{ id: "req-1", status: "rejected", tenant_id: "tenant-1" }] };
      }
      return { rows: [] };
    });

    await service.decide("tenant-1", "hr-1", "req-1", { decision: "rejected", note: "no coverage available" });

    const attendanceCalls = client.query.mock.calls.filter(
      ([text]) => typeof text === "string" && text.includes("INSERT INTO staff_attendance"),
    );
    expect(attendanceCalls).toHaveLength(0);
  });

  it("blocks deciding a request that's already been decided", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: "req-1", tenant_id: "tenant-1", status: "approved" }] });

    await expect(service.decide("tenant-1", "hr-1", "req-1", { decision: "approved" })).rejects.toThrow();
  });

  it("approving a half-day request writes a staff_attendance 'half_day' row instead of 'leave'", async () => {
    client.query.mockImplementation(async (text: unknown) => {
      if (typeof text === "string" && text.includes("FROM staff_leave_requests lr")) {
        return {
          rows: [
            {
              id: "req-1",
              status: "pending",
              tenant_id: "tenant-1",
              branch_id: "branch-1",
              staff_id: "staff-1",
              start_date: new Date("2026-04-10T00:00:00.000Z"),
              end_date: new Date("2026-04-10T00:00:00.000Z"),
              is_half_day: true,
              staff_first_name: "Asha",
              staff_last_name: "Rao",
            },
          ],
        };
      }
      if (typeof text === "string" && text.startsWith("UPDATE staff_leave_requests")) {
        return { rows: [{ id: "req-1", status: "approved", tenant_id: "tenant-1" }] };
      }
      return { rows: [] };
    });

    await service.decide("tenant-1", "hr-1", "req-1", { decision: "approved" });

    const attendanceCalls = client.query.mock.calls.filter(
      ([text]) => typeof text === "string" && text.includes("INSERT INTO staff_attendance"),
    );
    expect(attendanceCalls).toHaveLength(1);
    expect(attendanceCalls[0][1]).toContain("half_day");
    expect(attendanceCalls[0][1]).not.toContain("leave");
  });
});
