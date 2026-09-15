import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { componentAmount, daysInMonth, PayrollService } from "./payroll.service.js";

function makePrismaMock() {
  const tx = {
    payslip: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    payslipLineItem: { updateMany: vi.fn() },
    payrollRun: { update: vi.fn() },
  };
  return {
    payrollRun: { findFirst: vi.fn() },
    payslip: { count: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
  } as unknown as PrismaService & {
    payrollRun: { findFirst: ReturnType<typeof vi.fn> };
    payslip: { count: ReturnType<typeof vi.fn> };
    __tx: typeof tx;
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("componentAmount", () => {
  it("returns the fixed amount as-is for a fixed component", () => {
    expect(componentAmount(3_000_000, { calculationType: "fixed", amount: 500_000, percent: null })).toBe(500_000);
  });

  it("computes percent_of_basic rounded to the nearest paisa", () => {
    // 12% of 3,000,000 = 360,000 exactly
    expect(componentAmount(3_000_000, { calculationType: "percent_of_basic", amount: null, percent: 12 })).toBe(
      360_000,
    );
  });

  it("rounds a non-integer percent_of_basic result", () => {
    // 33,333.33... rounds to 33,333
    expect(componentAmount(1_000_000, { calculationType: "percent_of_basic", amount: null, percent: 3.3333 })).toBe(
      33_333,
    );
  });

  it("treats a missing percent as zero", () => {
    expect(componentAmount(1_000_000, { calculationType: "percent_of_basic", amount: null, percent: null })).toBe(0);
  });

  it("treats a missing fixed amount as zero", () => {
    expect(componentAmount(1_000_000, { calculationType: "fixed", amount: null, percent: null })).toBe(0);
  });
});

describe("daysInMonth", () => {
  it("matches the exact scenario from the Rust payroll_integration.rs test: April 2026 has 30 days", () => {
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it("handles a 31-day month", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
  });

  it("handles February in a non-leap year", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it("handles February in a leap year", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  it("handles December rolling over into the next year", () => {
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("PayrollService.deletePayrollRun", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: PayrollService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new PayrollService(prisma, audit);
  });

  it("throws NotFoundException when the run doesn't exist", async () => {
    prisma.payrollRun.findFirst.mockResolvedValueOnce(null);

    await expect(service.deletePayrollRun("tenant-1", "actor-1", "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects deleting a finalized run", async () => {
    prisma.payrollRun.findFirst.mockResolvedValueOnce({
      id: "run-1",
      branchId: "branch-1",
      status: "finalized",
      periodYear: 2026,
      periodMonth: 4,
    });

    await expect(service.deletePayrollRun("tenant-1", "actor-1", "run-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("soft-deletes a draft run, its payslips, and their line items", async () => {
    prisma.payrollRun.findFirst.mockResolvedValueOnce({
      id: "run-1",
      branchId: "branch-1",
      status: "draft",
      periodYear: 2026,
      periodMonth: 4,
    });
    prisma.__tx.payslip.findMany.mockResolvedValueOnce([{ id: "payslip-1" }, { id: "payslip-2" }]);

    await service.deletePayrollRun("tenant-1", "actor-1", "run-1");

    expect(prisma.__tx.payslipLineItem.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.__tx.payslip.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { payrollRunId: "run-1", deletedAt: null } }),
    );
    expect(prisma.__tx.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "run-1" } }),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("PayrollService.reopenPayrollRun", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: PayrollService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new PayrollService(prisma, audit);
  });

  it("rejects reopening a run that isn't finalized", async () => {
    prisma.payrollRun.findFirst.mockResolvedValueOnce({ id: "run-1", status: "draft" });

    await expect(service.reopenPayrollRun("tenant-1", "actor-1", "run-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects reopening a run that has any paid payslip", async () => {
    prisma.payrollRun.findFirst.mockResolvedValueOnce({ id: "run-1", status: "finalized" });
    prisma.payslip.count.mockResolvedValueOnce(1);

    await expect(service.reopenPayrollRun("tenant-1", "actor-1", "run-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("flips a finalized run and its payslips back to draft when none are paid", async () => {
    prisma.payrollRun.findFirst.mockResolvedValueOnce({ id: "run-1", status: "finalized" });
    prisma.payslip.count.mockResolvedValueOnce(0);

    await service.reopenPayrollRun("tenant-1", "actor-1", "run-1");

    expect(prisma.__tx.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "run-1" }, data: expect.objectContaining({ status: "draft" }) }),
    );
    expect(prisma.__tx.payslip.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "draft" }) }),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
