import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import { componentAmount, daysInMonth, PayrollService } from "./payroll.service.js";

function makePrismaMock() {
  const tx = {
    payslip: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    payslipLineItem: { updateMany: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    payrollRun: { update: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    salaryStructure: { create: vi.fn().mockResolvedValue({ id: "struct-new" }), findFirst: vi.fn() },
    salaryComponent: { create: vi.fn().mockResolvedValue({}) },
    staffAttendance: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return {
    payrollRun: { findFirst: vi.fn() },
    payslip: { count: vi.fn() },
    salaryStructure: { findFirst: vi.fn(), findMany: vi.fn() },
    staff: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
  } as unknown as PrismaService & {
    payrollRun: { findFirst: ReturnType<typeof vi.fn> };
    payslip: { count: ReturnType<typeof vi.fn> };
    salaryStructure: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    staff: { findMany: ReturnType<typeof vi.fn> };
    __tx: typeof tx;
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

function makeSchoolCalendarMock() {
  return { getDayTypesInRange: vi.fn().mockResolvedValue({}) } as unknown as SchoolCalendarService & {
    getDayTypesInRange: ReturnType<typeof vi.fn>;
  };
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
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: PayrollService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new PayrollService(prisma, audit, schoolCalendar);
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
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: PayrollService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new PayrollService(prisma, audit, schoolCalendar);
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

describe("PayrollService.getEffectiveSalaryStructure", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: PayrollService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new PayrollService(prisma, audit, schoolCalendar);
  });

  it("queries for the most recent structure effective on or before the given date", async () => {
    prisma.salaryStructure.findFirst.mockResolvedValueOnce({ id: "struct-2", salaryComponents: [] });
    const asOfDate = new Date("2026-06-15");

    const result = await service.getEffectiveSalaryStructure(prisma, "staff-1", asOfDate);

    expect(prisma.salaryStructure.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { staffId: "staff-1", deletedAt: null, effectiveFrom: { lte: asOfDate } },
        orderBy: { effectiveFrom: "desc" },
      }),
    );
    expect(result?.id).toBe("struct-2");
  });
});

describe("PayrollService.setSalaryStructure", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: PayrollService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new PayrollService(prisma, audit, schoolCalendar);
  });

  it("inserts a new structure as an increment, without touching prior ones", async () => {
    await service.setSalaryStructure("tenant-1", "actor-1", {
      staff_id: "staff-1",
      branch_id: "branch-1",
      effective_from: "2026-04-01",
      basic_amount: 500_000,
      components: [{ component_name: "HRA", component_type: "earning", calculation_type: "fixed", amount: 100_000 }],
    });

    expect(prisma.salaryStructure.findMany).not.toHaveBeenCalled();
    expect(prisma.__tx.salaryStructure.create).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.salaryComponent.create).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("PayrollService.listSalaryHistory", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: PayrollService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new PayrollService(prisma, audit, schoolCalendar);
  });

  it("returns every historical structure, most recent first", async () => {
    prisma.salaryStructure.findMany.mockResolvedValueOnce([
      { id: "struct-2", staffId: "staff-1", effectiveFrom: new Date("2026-04-01"), basicAmount: 600_000, salaryComponents: [] },
      { id: "struct-1", staffId: "staff-1", effectiveFrom: new Date("2026-01-01"), basicAmount: 500_000, salaryComponents: [] },
    ]);

    const result = await service.listSalaryHistory("staff-1");

    expect(prisma.salaryStructure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { staffId: "staff-1", deletedAt: null }, orderBy: { effectiveFrom: "desc" } }),
    );
    expect(result).toEqual([
      { id: "struct-2", staff_id: "staff-1", effective_from: new Date("2026-04-01"), basic_amount: 600_000, components: [] },
      { id: "struct-1", staff_id: "staff-1", effective_from: new Date("2026-01-01"), basic_amount: 500_000, components: [] },
    ]);
  });
});

describe("PayrollService.generatePayrollRun", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: PayrollService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    schoolCalendar = makeSchoolCalendarMock();
    service = new PayrollService(prisma, audit, schoolCalendar);
  });

  it("skips holiday days entirely and still counts a school-defined half-day as a full working day", async () => {
    // A 3-day period: an ordinary working day, a full holiday, and a
    // school-defined half-day. workingDaysInPeriod = 1 + 0 + 1 = 2 -- the
    // school half-day counts as a full day, only the holiday is excluded.
    schoolCalendar.getDayTypesInRange.mockResolvedValueOnce({
      "2026-02-01": "working",
      "2026-02-02": "holiday",
      "2026-02-03": "half_day",
    });
    prisma.staff.findMany.mockResolvedValueOnce([{ id: "staff-1", firstName: "Asha", lastName: "Rao" }]);
    prisma.__tx.salaryStructure.findFirst.mockResolvedValueOnce({
      id: "struct-1",
      basicAmount: 300_000,
      salaryComponents: [],
    });
    prisma.__tx.staffAttendance.findMany.mockResolvedValueOnce([
      // Absent on the ordinary working day -> full LOP day.
      { staffId: "staff-1", attendanceDate: new Date("2026-02-01T00:00:00.000Z"), status: "absent" },
      // Present on the holiday -- must be ignored entirely, never present or LOP.
      { staffId: "staff-1", attendanceDate: new Date("2026-02-02T00:00:00.000Z"), status: "present" },
      // The staff member's own half_day attendance status (left early) on
      // the calendar's (now full-weight) half-day -> half of the 1.0
      // weight each way. This is the person-level half_day, distinct from
      // the calendar's half_day day-type.
      { staffId: "staff-1", attendanceDate: new Date("2026-02-03T00:00:00.000Z"), status: "half_day" },
    ]);

    const result = await service.generatePayrollRun("tenant-1", "actor-1", {
      branch_id: "branch-1",
      period_year: 2026,
      period_month: 2,
    });

    expect(schoolCalendar.getDayTypesInRange).toHaveBeenCalledWith(
      "tenant-1",
      "branch-1",
      "2026-02-01",
      "2026-02-28",
    );

    const payslip = result.payslips[0];
    expect(payslip.days_in_month).toBe(2); // workingDaysInPeriod
    expect(payslip.days_present).toBe(0.5); // half of the half-day's full 1.0 weight
    expect(payslip.days_lop).toBe(1.5); // 1 (absent) + half of the half-day's full 1.0 weight

    // lopAmount = round(grossBeforeLop / workingDaysInPeriod * daysLop)
    //           = round(300000 / 2 * 1.5) = round(225000) = 225000
    expect(payslip.gross_earnings).toBe(75_000); // 300000 - 225000
    expect(payslip.net_pay).toBe(75_000);

    expect(prisma.__tx.payslip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ daysInMonth: 2, daysPresent: 0.5, daysLop: 1.5 }),
      }),
    );
  });

  it("skips a staff member with no salary structure configured", async () => {
    schoolCalendar.getDayTypesInRange.mockResolvedValueOnce({ "2026-02-01": "working" });
    prisma.staff.findMany.mockResolvedValueOnce([{ id: "staff-1", firstName: "Asha", lastName: "Rao" }]);
    prisma.__tx.salaryStructure.findFirst.mockResolvedValueOnce(null);

    const result = await service.generatePayrollRun("tenant-1", "actor-1", {
      branch_id: "branch-1",
      period_year: 2026,
      period_month: 2,
    });

    expect(result.payslips).toHaveLength(0);
    expect(prisma.__tx.payslip.create).not.toHaveBeenCalled();
  });
});
