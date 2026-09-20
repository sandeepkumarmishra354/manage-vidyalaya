import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import type { SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import { componentAmount, daysInMonth, PayrollService } from "./payroll.service.js";

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
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: PayrollService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new PayrollService(db, audit, makeSchoolCalendarMock());
  });

  it("throws NotFoundException when the run doesn't exist", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.deletePayrollRun("tenant-1", "actor-1", "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects deleting a finalized run", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "run-1", tenant_id: "tenant-1", branch_id: "branch-1", status: "finalized", period_year: 2026, period_month: 4 }],
    });

    await expect(service.deletePayrollRun("tenant-1", "actor-1", "run-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("soft-deletes a draft run, its payslips, and their line items", async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: "run-1", tenant_id: "tenant-1", branch_id: "branch-1", status: "draft", period_year: 2026, period_month: 4 }],
      }) // findOneForTenant run
      .mockResolvedValueOnce({ rows: [{ id: "payslip-1" }, { id: "payslip-2" }] }) // payslip ids
      .mockResolvedValueOnce({ rows: [] }) // update line items
      .mockResolvedValueOnce({ rows: [] }) // update payslips
      .mockResolvedValueOnce({ rows: [{ id: "run-1", tenant_id: "tenant-1" }] }); // updateRow run

    await service.deletePayrollRun("tenant-1", "actor-1", "run-1");

    const lineItemsCall = client.query.mock.calls.find(([text]) => /UPDATE payslip_line_items SET/.test(text as string));
    expect(lineItemsCall![1]).toContainEqual(["payslip-1", "payslip-2"]);
    const payslipsCall = client.query.mock.calls.find(([text]) => /UPDATE payslips SET deleted_at/.test(text as string));
    expect(payslipsCall![1]).toContain("run-1");
    const runUpdateCall = client.query.mock.calls.find(([text]) => /UPDATE payroll_runs SET/.test(text as string));
    expect(runUpdateCall![1]).toContain("run-1");
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("PayrollService.reopenPayrollRun", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: PayrollService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new PayrollService(db, audit, makeSchoolCalendarMock());
  });

  it("rejects reopening a run that isn't finalized", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: "run-1", tenant_id: "tenant-1", status: "draft" }] });

    await expect(service.reopenPayrollRun("tenant-1", "actor-1", "run-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects reopening a run that has any paid payslip", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "run-1", tenant_id: "tenant-1", status: "finalized" }] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] });

    await expect(service.reopenPayrollRun("tenant-1", "actor-1", "run-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("flips a finalized run and its payslips back to draft when none are paid", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "run-1", tenant_id: "tenant-1", status: "finalized" }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ id: "run-1", tenant_id: "tenant-1", status: "draft" }] }) // updateRow run
      .mockResolvedValueOnce({ rows: [] }); // update payslips

    await service.reopenPayrollRun("tenant-1", "actor-1", "run-1");

    const runUpdateCall = client.query.mock.calls.find(([text]) => /UPDATE payroll_runs SET/.test(text as string));
    expect(runUpdateCall![1]).toContain("draft");
    const payslipsCall = client.query.mock.calls.find(([text]) => /UPDATE payslips SET status = 'draft'/.test(text as string));
    expect(payslipsCall).toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("PayrollService.getEffectiveSalaryStructure", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let service: PayrollService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new PayrollService(db, makeAuditMock(), makeSchoolCalendarMock());
  });

  it("queries for the most recent structure effective on or before the given date", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "struct-2", tenant_id: "tenant-1", staff_id: "staff-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const asOfDate = new Date("2026-06-15");

    const result = await service.getEffectiveSalaryStructure(client as unknown as PoolClient, "tenant-1", "staff-1", asOfDate);

    const [text, params] = client.query.mock.calls[0];
    expect(text).toMatch(/effective_from <= \$3/);
    expect(text).toMatch(/ORDER BY effective_from DESC/);
    expect(params).toEqual(["tenant-1", "staff-1", asOfDate]);
    expect(result?.structure.id).toBe("struct-2");
  });
});

describe("PayrollService.setSalaryStructure", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: PayrollService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new PayrollService(db, audit, makeSchoolCalendarMock());
  });

  it("inserts a new structure as an increment, without touching prior ones", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "struct-new", tenant_id: "tenant-1" }] }) // insert structure
      .mockResolvedValueOnce({ rows: [{ id: "comp-1", tenant_id: "tenant-1" }] }); // insert component

    await service.setSalaryStructure("tenant-1", "actor-1", {
      staff_id: "staff-1",
      branch_id: "branch-1",
      effective_from: "2026-04-01",
      basic_amount: 500_000,
      components: [{ component_name: "HRA", component_type: "earning", calculation_type: "fixed", amount: 100_000 }],
    });

    expect(client.query.mock.calls.some(([text]) => /INSERT INTO salary_structures/.test(text as string))).toBe(true);
    expect(client.query.mock.calls.some(([text]) => /INSERT INTO salary_components/.test(text as string))).toBe(true);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("PayrollService.listSalaryHistory", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let service: PayrollService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    service = new PayrollService(db, makeAuditMock(), makeSchoolCalendarMock());
  });

  it("returns every historical structure, most recent first", async () => {
    db.query
      .mockResolvedValueOnce([
        { id: "struct-2", tenant_id: "tenant-1", staff_id: "staff-1", effective_from: new Date("2026-04-01"), basic_amount: 600_000 },
        { id: "struct-1", tenant_id: "tenant-1", staff_id: "staff-1", effective_from: new Date("2026-01-01"), basic_amount: 500_000 },
      ])
      .mockResolvedValueOnce([]); // components

    const result = await service.listSalaryHistory("tenant-1", "staff-1");

    const [, text, params] = db.query.mock.calls[0];
    expect(text).toMatch(/ORDER BY effective_from DESC/);
    expect(params).toEqual(["tenant-1", "staff-1"]);
    expect(result).toEqual([
      { id: "struct-2", staff_id: "staff-1", effective_from: new Date("2026-04-01"), basic_amount: 600_000, components: [] },
      { id: "struct-1", staff_id: "staff-1", effective_from: new Date("2026-01-01"), basic_amount: 500_000, components: [] },
    ]);
  });
});

describe("PayrollService.generatePayrollRun", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let schoolCalendar: ReturnType<typeof makeSchoolCalendarMock>;
  let service: PayrollService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    schoolCalendar = makeSchoolCalendarMock();
    service = new PayrollService(db, makeAuditMock(), schoolCalendar);
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
    db.query.mockResolvedValueOnce([{ id: "staff-1", first_name: "Asha", last_name: "Rao" }]); // activeStaff

    client.query.mockImplementation(async (text: string) => {
      if (/FROM staff_attendance/.test(text)) {
        return {
          rows: [
            // Absent on the ordinary working day -> full LOP day.
            { staff_id: "staff-1", attendance_date: new Date("2026-02-01T00:00:00.000Z"), status: "absent" },
            // Present on the holiday -- must be ignored entirely, never present or LOP.
            { staff_id: "staff-1", attendance_date: new Date("2026-02-02T00:00:00.000Z"), status: "present" },
            // The staff member's own half_day attendance status (left early) on
            // the calendar's (now full-weight) half-day -> half of the 1.0
            // weight each way. This is the person-level half_day, distinct from
            // the calendar's half_day day-type.
            { staff_id: "staff-1", attendance_date: new Date("2026-02-03T00:00:00.000Z"), status: "half_day" },
          ],
        };
      }
      if (/INSERT INTO payroll_runs/.test(text)) {
        return { rows: [{ id: "run-1", tenant_id: "tenant-1" }] };
      }
      if (/FROM salary_structures WHERE/.test(text)) {
        return { rows: [{ id: "struct-1", tenant_id: "tenant-1", basic_amount: 300_000 }] };
      }
      if (/FROM salary_components WHERE/.test(text)) {
        return { rows: [] };
      }
      if (/INSERT INTO payslips/.test(text)) {
        return { rows: [{ id: "payslip-1", tenant_id: "tenant-1" }] };
      }
      if (/INSERT INTO payslip_line_items/.test(text)) {
        return { rows: [{ id: "item-1", tenant_id: "tenant-1" }] };
      }
      return { rows: [] };
    });

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

    expect(client.query.mock.calls.some(([text]) => /INSERT INTO payslips /.test(text as string))).toBe(true);
  });

  it("skips a staff member with no salary structure configured", async () => {
    schoolCalendar.getDayTypesInRange.mockResolvedValueOnce({ "2026-02-01": "working" });
    db.query.mockResolvedValueOnce([{ id: "staff-1", first_name: "Asha", last_name: "Rao" }]);

    client.query.mockImplementation(async (text: string) => {
      if (/FROM salary_structures WHERE/.test(text)) return { rows: [] };
      if (/INSERT INTO payroll_runs/.test(text)) return { rows: [{ id: "run-1", tenant_id: "tenant-1" }] };
      return { rows: [] };
    });

    const result = await service.generatePayrollRun("tenant-1", "actor-1", {
      branch_id: "branch-1",
      period_year: 2026,
      period_month: 2,
    });

    expect(result.payslips).toHaveLength(0);
    expect(client.query.mock.calls.some(([text]) => /INSERT INTO payslips /.test(text as string))).toBe(false);
  });

  // Regression test: payroll_runs' (branch_id, period_month, period_year)
  // unique index used to have no `WHERE deleted_at IS NULL` filter, so
  // deleting a draft run and regenerating for the same period hit the
  // index and threw an unhandled 500 -- the same soft-delete-leaves-a-
  // live-uniqueness-slot bug class as the timetable period-slot fix. The
  // index itself is now scoped to live rows (migration), and this covers
  // the remaining case of a genuine duplicate against a still-live run:
  // the raw unique-violation error must surface as a clean 409, not crash.
  it("translates a unique-constraint clash on insert into a 409, not an unhandled error", async () => {
    schoolCalendar.getDayTypesInRange.mockResolvedValueOnce({ "2026-02-01": "working" });
    db.query.mockResolvedValueOnce([]);

    client.query.mockImplementation(async (text: string) => {
      if (/INSERT INTO payroll_runs/.test(text)) {
        const error = new Error("duplicate key value violates unique constraint") as Error & { code: string };
        error.code = "23505";
        throw error;
      }
      return { rows: [] };
    });

    await expect(
      service.generatePayrollRun("tenant-1", "actor-1", {
        branch_id: "branch-1",
        period_year: 2026,
        period_month: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

// Phase 2: branch-scoped callers must not be able to view/update/delete a
// same-tenant payroll_runs/salary_structures row (or reach a payslip
// through one) belonging to a *different* branch -- a branch mismatch maps
// to NotFoundException, exactly like a wrong id would.
describe("PayrollService branch isolation (Phase 2)", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: PayrollService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new PayrollService(db, audit, makeSchoolCalendarMock());
  });

  describe("getPayrollRun", () => {
    it("404s a run that belongs to a different branch", async () => {
      db.queryOne.mockResolvedValueOnce(null); // WHERE ... AND branch_id = $3 filtered it out

      await expect(service.getPayrollRun("tenant-1", "run-1", "branch-mine")).rejects.toBeInstanceOf(
        NotFoundException,
      );

      const [, text, params] = db.queryOne.mock.calls[0];
      expect(text).toMatch(/branch_id = \$/);
      expect(params).toContain("branch-mine");
    });

    it("returns a run that belongs to the caller's own branch", async () => {
      db.queryOne.mockResolvedValueOnce({ id: "run-1", tenant_id: "tenant-1", branch_id: "branch-mine" });
      db.query.mockResolvedValueOnce([]); // payslips

      const result = await service.getPayrollRun("tenant-1", "run-1", "branch-mine");
      expect(result.run.id).toBe("run-1");
    });

    it("adds no branch filter for an unscoped caller (branchId null)", async () => {
      db.queryOne.mockResolvedValueOnce({ id: "run-1", tenant_id: "tenant-1" });
      db.query.mockResolvedValueOnce([]);

      await service.getPayrollRun("tenant-1", "run-1", null);

      const [, text] = db.queryOne.mock.calls[0];
      expect(text).not.toMatch(/branch_id/);
    });
  });

  describe("finalizePayrollRun", () => {
    it("404s a run that belongs to a different branch", async () => {
      client.query.mockResolvedValueOnce({ rows: [] }); // updateRow filtered out by branch_id

      await expect(
        service.finalizePayrollRun("tenant-1", "actor-1", "run-1", "branch-mine"),
      ).rejects.toBeInstanceOf(NotFoundException);

      const [text, params] = client.query.mock.calls[0];
      expect(text).toMatch(/branch_id = \$/);
      expect(params).toContain("branch-mine");
    });
  });

  describe("deletePayrollRun", () => {
    it("404s a run that belongs to a different branch", async () => {
      client.query.mockResolvedValueOnce({ rows: [] }); // findOneForTenant filtered out by branch_id

      await expect(service.deletePayrollRun("tenant-1", "actor-1", "run-1", "branch-mine")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("markPayslipPaid", () => {
    it("404s when the payslip's own payroll run belongs to a different branch", async () => {
      client.query
        .mockResolvedValueOnce({ rows: [{ id: "payslip-1", tenant_id: "tenant-1", payroll_run_id: "run-1" }] }) // findOneForTenant payslip
        .mockResolvedValueOnce({ rows: [] }); // findOneForTenant payroll_runs filtered out by branch_id

      await expect(
        service.markPayslipPaid("tenant-1", "actor-1", "payslip-1", "2026-05-01", "branch-mine"),
      ).rejects.toBeInstanceOf(NotFoundException);

      const [text, params] = client.query.mock.calls[1];
      expect(text).toMatch(/FROM payroll_runs/);
      expect(text).toMatch(/branch_id = \$/);
      expect(params).toContain("branch-mine");
    });

    it("marks a payslip paid when its run belongs to the caller's own branch", async () => {
      client.query
        .mockResolvedValueOnce({ rows: [{ id: "payslip-1", tenant_id: "tenant-1", payroll_run_id: "run-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "run-1", tenant_id: "tenant-1", branch_id: "branch-mine" }] })
        .mockResolvedValueOnce({ rows: [{ id: "payslip-1", tenant_id: "tenant-1", status: "paid" }] });

      const result = await service.markPayslipPaid("tenant-1", "actor-1", "payslip-1", "2026-05-01", "branch-mine");
      expect(result.id).toBe("payslip-1");
    });

    it("skips the parent-run check entirely for an unscoped caller", async () => {
      client.query
        .mockResolvedValueOnce({ rows: [{ id: "payslip-1", tenant_id: "tenant-1", payroll_run_id: "run-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "payslip-1", tenant_id: "tenant-1", status: "paid" }] });

      await service.markPayslipPaid("tenant-1", "actor-1", "payslip-1", "2026-05-01", null);

      expect(client.query).toHaveBeenCalledTimes(2); // no payroll_runs lookup at all
    });
  });
});
