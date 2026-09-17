import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { ScopedAccessService } from "../common/scoped-access.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { StaffLeaveService } from "./staff-leave.service.js";

function makePrismaMock() {
  const tx = {
    staffLeaveRequest: { create: vi.fn(), update: vi.fn() },
    staffAttendance: { upsert: vi.fn() },
  };
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
    staffLeaveRequest: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    staff: { findFirst: vi.fn() },
  } as unknown as PrismaService & {
    __tx: typeof tx;
    staffLeaveRequest: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    staff: { findFirst: ReturnType<typeof vi.fn> };
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

function makeScopedAccessMock() {
  return { getActingStaff: vi.fn() } as unknown as ScopedAccessService & { getActingStaff: ReturnType<typeof vi.fn> };
}

describe("StaffLeaveService.apply", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let service: StaffLeaveService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    service = new StaffLeaveService(prisma, audit, scopedAccess);
  });

  it("creates a pending request for the caller's own linked staff row", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branchId: "branch-1" });
    prisma.staffLeaveRequest.create.mockResolvedValueOnce({ id: "req-1", status: "pending" });

    await service.apply("tenant-1", "user-1", { start_date: "2026-04-10", end_date: "2026-04-12", reason: "wedding" });

    expect(prisma.staffLeaveRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          staffId: "staff-1",
          branchId: "branch-1",
          status: "pending",
          requestedByUserId: "user-1",
        }),
      }),
    );
  });

  it("rejects when the logged-in user has no linked staff record", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce(null);

    await expect(
      service.apply("tenant-1", "user-1", { start_date: "2026-04-10", end_date: "2026-04-12" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.staffLeaveRequest.create).not.toHaveBeenCalled();
  });

  it("rejects an end date before the start date", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branchId: "branch-1" });

    await expect(
      service.apply("tenant-1", "user-1", { start_date: "2026-04-12", end_date: "2026-04-10" }),
    ).rejects.toThrow();
  });
});

describe("StaffLeaveService.cancel", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let service: StaffLeaveService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    service = new StaffLeaveService(prisma, audit, scopedAccess);
  });

  it("cancels the caller's own pending request", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branchId: "branch-1" });
    prisma.staffLeaveRequest.findFirst.mockResolvedValueOnce({ id: "req-1", status: "pending" });
    prisma.staffLeaveRequest.update.mockResolvedValueOnce({ id: "req-1", status: "cancelled" });

    await service.cancel("tenant-1", "user-1", "req-1");

    expect(prisma.staffLeaveRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "req-1" }, data: expect.objectContaining({ status: "cancelled" }) }),
    );
  });

  it("blocks cancelling a request that isn't pending", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branchId: "branch-1" });
    prisma.staffLeaveRequest.findFirst.mockResolvedValueOnce({ id: "req-1", status: "approved" });

    await expect(service.cancel("tenant-1", "user-1", "req-1")).rejects.toThrow();
    expect(prisma.staffLeaveRequest.update).not.toHaveBeenCalled();
  });

  it("404s when the request isn't the caller's own", async () => {
    scopedAccess.getActingStaff.mockResolvedValueOnce({ id: "staff-1", branchId: "branch-1" });
    prisma.staffLeaveRequest.findFirst.mockResolvedValueOnce(null);

    await expect(service.cancel("tenant-1", "user-1", "req-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("StaffLeaveService.file (HR on-behalf)", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let service: StaffLeaveService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    service = new StaffLeaveService(prisma, audit, scopedAccess);
  });

  it("creates the request already approved and writes attendance for every date in range", async () => {
    prisma.staff.findFirst.mockResolvedValueOnce({
      id: "staff-1",
      branchId: "branch-1",
      firstName: "Asha",
      lastName: "Rao",
    });
    prisma.__tx.staffLeaveRequest.create.mockResolvedValueOnce({ id: "req-1", status: "approved" });
    prisma.__tx.staffAttendance.upsert.mockResolvedValue({});

    await service.file("tenant-1", "hr-1", {
      staff_id: "staff-1",
      start_date: "2026-04-10",
      end_date: "2026-04-12",
    });

    expect(prisma.__tx.staffLeaveRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "approved", decidedByUserId: "hr-1" }),
      }),
    );
    // 3 inclusive days: 10, 11, 12 April.
    expect(prisma.__tx.staffAttendance.upsert).toHaveBeenCalledTimes(3);
    for (const call of prisma.__tx.staffAttendance.upsert.mock.calls) {
      expect(call[0].create.status).toBe("leave");
    }
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("404s when the target staff member doesn't exist", async () => {
    prisma.staff.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.file("tenant-1", "hr-1", { staff_id: "missing", start_date: "2026-04-10", end_date: "2026-04-12" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("StaffLeaveService.decide", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let service: StaffLeaveService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    service = new StaffLeaveService(prisma, audit, scopedAccess);
  });

  it("approving writes a StaffAttendance 'leave' row for every date in the range", async () => {
    prisma.staffLeaveRequest.findFirst.mockResolvedValueOnce({
      id: "req-1",
      status: "pending",
      branchId: "branch-1",
      staffId: "staff-1",
      startDate: new Date("2026-04-10T00:00:00.000Z"),
      endDate: new Date("2026-04-11T00:00:00.000Z"),
      staff: { firstName: "Asha", lastName: "Rao" },
    });
    prisma.__tx.staffLeaveRequest.update.mockResolvedValueOnce({ id: "req-1", status: "approved" });
    prisma.__tx.staffAttendance.upsert.mockResolvedValue({});

    await service.decide("tenant-1", "hr-1", "req-1", { decision: "approved" });

    expect(prisma.__tx.staffAttendance.upsert).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("rejecting writes no attendance", async () => {
    prisma.staffLeaveRequest.findFirst.mockResolvedValueOnce({
      id: "req-1",
      status: "pending",
      branchId: "branch-1",
      staffId: "staff-1",
      startDate: new Date("2026-04-10T00:00:00.000Z"),
      endDate: new Date("2026-04-11T00:00:00.000Z"),
      staff: { firstName: "Asha", lastName: "Rao" },
    });
    prisma.__tx.staffLeaveRequest.update.mockResolvedValueOnce({ id: "req-1", status: "rejected" });

    await service.decide("tenant-1", "hr-1", "req-1", { decision: "rejected", note: "no coverage available" });

    expect(prisma.__tx.staffAttendance.upsert).not.toHaveBeenCalled();
  });

  it("blocks deciding a request that's already been decided", async () => {
    prisma.staffLeaveRequest.findFirst.mockResolvedValueOnce({ id: "req-1", status: "approved" });

    await expect(service.decide("tenant-1", "hr-1", "req-1", { decision: "approved" })).rejects.toThrow();
  });
});
