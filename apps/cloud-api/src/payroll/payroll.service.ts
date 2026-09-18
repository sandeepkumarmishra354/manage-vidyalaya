import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { findOneForTenant, insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import { dayWeight, SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import type { AdjustLineItemDto } from "./dto/adjust-line-item.dto.js";
import type { GeneratePayrollRunDto } from "./dto/generate-payroll-run.dto.js";
import type { SetSalaryStructureDto } from "./dto/set-salary-structure.dto.js";

export interface ComponentLike {
  calculationType: string;
  amount: number | null;
  percent: number | null;
}

export interface SalaryStructureRow extends TenantRow {
  branch_id: string;
  staff_id: string;
  effective_from: Date;
  basic_amount: number;
}

interface SalaryComponentRow extends TenantRow {
  salary_structure_id: string;
  component_name: string;
  component_type: string;
  calculation_type: string;
  amount: number | null;
  percent: number | null;
}

export interface PayrollRunRow extends TenantRow {
  branch_id: string;
  period_month: number;
  period_year: number;
  status: string;
  generated_at: Date;
  generated_by: string | null;
}

export interface PayslipRow extends TenantRow {
  payroll_run_id: string;
  staff_id: string;
  days_in_month: number;
  days_present: number;
  days_lop: number;
  gross_earnings: number;
  total_deductions: number;
  net_pay: number;
  status: string;
  paid_on: Date | null;
}

interface PayslipLineItemRow extends TenantRow {
  payslip_id: string;
  component_name: string;
  component_type: string;
  amount: number;
}

// percent_of_basic: basic_amount * percent / 100, rounded. fixed: the
// stored amount as-is. Matches commands/payroll.rs::component_amount.
export function componentAmount(basicAmount: number, component: ComponentLike): number {
  if (component.calculationType === "percent_of_basic") {
    return Math.round((basicAmount * (component.percent ?? 0)) / 100);
  }
  return component.amount ?? 0;
}

export function daysInMonth(year: number, month: number): number {
  const startOfThis = Date.UTC(year, month - 1, 1);
  const startOfNext = month === 12 ? Date.UTC(year + 1, 0, 1) : Date.UTC(year, month, 1);
  return Math.round((startOfNext - startOfThis) / (24 * 60 * 60 * 1000));
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly schoolCalendar: SchoolCalendarService,
  ) {}

  // "The structure that was in force on this date" -- the most recent
  // structure whose effective_from is on or before asOfDate. Takes a
  // PoolClient (not a tenantId-scoped db.query) since generatePayrollRun
  // needs this resolved consistently inside its own transaction rather
  // than against a separate connection.
  async getEffectiveSalaryStructure(
    client: PoolClient,
    tenantId: string,
    staffId: string,
    asOfDate: Date,
  ): Promise<{ structure: SalaryStructureRow; components: SalaryComponentRow[] } | null> {
    const structureResult = await client.query<SalaryStructureRow>(
      "SELECT * FROM salary_structures WHERE tenant_id = $1 AND staff_id = $2 AND deleted_at IS NULL AND effective_from <= $3 ORDER BY effective_from DESC LIMIT 1",
      [tenantId, staffId, asOfDate],
    );
    const structure = structureResult.rows[0];
    if (!structure) return null;

    const componentsResult = await client.query<SalaryComponentRow>(
      "SELECT * FROM salary_components WHERE tenant_id = $1 AND salary_structure_id = $2 AND deleted_at IS NULL",
      [tenantId, structure.id],
    );
    return { structure, components: componentsResult.rows };
  }

  private formatStructure(structure: SalaryStructureRow, components: SalaryComponentRow[]) {
    return {
      id: structure.id,
      staff_id: structure.staff_id,
      effective_from: structure.effective_from,
      basic_amount: structure.basic_amount,
      components: components.map((c) => ({
        id: c.id,
        component_name: c.component_name,
        component_type: c.component_type,
        calculation_type: c.calculation_type,
        amount: c.amount,
        percent: c.percent,
      })),
    };
  }

  async getSalaryStructure(tenantId: string, staffId: string) {
    const result = await this.db.withTransaction(tenantId, (client) =>
      this.getEffectiveSalaryStructure(client, tenantId, staffId, new Date()),
    );
    return result ? this.formatStructure(result.structure, result.components) : null;
  }

  // Every historical structure a staff member has ever had, most recent
  // first -- the increment history behind the "current" one getSalaryStructure
  // returns.
  async listSalaryHistory(tenantId: string, staffId: string) {
    const structures = await this.db.query<SalaryStructureRow>(
      tenantId,
      "SELECT * FROM salary_structures WHERE tenant_id = $1 AND staff_id = $2 AND deleted_at IS NULL ORDER BY effective_from DESC",
      [tenantId, staffId],
    );
    if (structures.length === 0) return [];

    const components = await this.db.query<SalaryComponentRow>(
      tenantId,
      "SELECT * FROM salary_components WHERE tenant_id = $1 AND salary_structure_id = ANY($2) AND deleted_at IS NULL",
      [tenantId, structures.map((s) => s.id)],
    );
    const byStructure = new Map<string, SalaryComponentRow[]>();
    for (const c of components) {
      const list = byStructure.get(c.salary_structure_id) ?? [];
      list.push(c);
      byStructure.set(c.salary_structure_id, list);
    }

    return structures.map((s) => this.formatStructure(s, byStructure.get(s.id) ?? []));
  }

  // Records a new salary structure effective from dto.effective_from. This
  // is an increment, not a replacement -- prior structures are left alone
  // (never soft-deleted) so getEffectiveSalaryStructure/listSalaryHistory
  // can resolve whichever one was in force for any given date, including
  // past payroll runs that must keep using the structure that applied then.
  async setSalaryStructure(tenantId: string, actorUserId: string, dto: SetSalaryStructureDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();

      const structure = await insertRow<SalaryStructureRow>(client, "salary_structures", tenantId, {
        branch_id: dto.branch_id,
        staff_id: dto.staff_id,
        effective_from: new Date(dto.effective_from),
        basic_amount: dto.basic_amount,
        updated_at: now,
      });

      for (const component of dto.components) {
        await insertRow<SalaryComponentRow>(client, "salary_components", tenantId, {
          salary_structure_id: structure.id,
          component_name: component.component_name,
          component_type: component.component_type,
          calculation_type: component.calculation_type,
          amount: component.amount ?? null,
          percent: component.percent ?? null,
          updated_at: now,
        });
      }

      await this.audit.record(client, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "salary_structures",
        entityId: structure.id,
        action: "create",
        summary: "Set salary structure",
      });
    });
  }

  // Generates one payroll run for a branch/month, with one payslip per
  // active staff member who has a salary structure. Working days and
  // loss-of-pay days are both derived from the school calendar (section A):
  // a holiday never counts, a school-defined half-day still counts as a
  // full working day for everyone (the school itself decided to run it),
  // and staff_attendance status is only consulted on days that aren't a
  // full holiday -- present = full paid day, half_day (the staff member's
  // own attendance status, distinct from a calendar half-day) = half
  // paid/half LOP, absent = full LOP, leave = paid (not counted). Days with
  // no attendance record are not penalized. PF/ESI/Professional-Tax/TDS are
  // whatever the salary structure's deduction components say, not computed
  // against government slabs.
  async generatePayrollRun(tenantId: string, actorUserId: string, dto: GeneratePayrollRunDto) {
    const periodStart = new Date(Date.UTC(dto.period_year, dto.period_month - 1, 1));
    const periodEnd =
      dto.period_month === 12
        ? new Date(Date.UTC(dto.period_year + 1, 0, 1))
        : new Date(Date.UTC(dto.period_year, dto.period_month, 1));
    // Last calendar day of the period -- the "as of" date used to resolve
    // which salary structure applies, so a mid-month increment takes effect
    // for that whole month's run rather than being ignored until next month.
    const periodLastDay = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);

    const startIso = periodStart.toISOString().slice(0, 10);
    const endIso = periodLastDay.toISOString().slice(0, 10);
    const dayTypes = await this.schoolCalendar.getDayTypesInRange(tenantId, dto.branch_id, startIso, endIso);
    const workingDaysInPeriod = Object.values(dayTypes).reduce((sum, t) => sum + dayWeight(t), 0);

    const activeStaff = await this.db.query<{ id: string; first_name: string; last_name: string | null }>(
      tenantId,
      "SELECT id, first_name, last_name FROM staff WHERE tenant_id = $1 AND branch_id = $2 AND status = 'active' AND deleted_at IS NULL",
      [tenantId, dto.branch_id],
    );

    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      const runId = randomUUID();

      const attendanceResult = await client.query<{ staff_id: string; attendance_date: Date; status: string }>(
        "SELECT staff_id, attendance_date, status FROM staff_attendance WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL AND attendance_date >= $3 AND attendance_date < $4",
        [tenantId, dto.branch_id, periodStart, periodEnd],
      );
      const attendanceByStaff = new Map<string, Map<string, string>>();
      for (const record of attendanceResult.rows) {
        const iso = record.attendance_date.toISOString().slice(0, 10);
        const staffDays = attendanceByStaff.get(record.staff_id) ?? new Map<string, string>();
        staffDays.set(iso, record.status);
        attendanceByStaff.set(record.staff_id, staffDays);
      }

      await insertRow<PayrollRunRow>(client, "payroll_runs", tenantId, {
        id: runId,
        branch_id: dto.branch_id,
        period_month: dto.period_month,
        period_year: dto.period_year,
        status: "draft",
        generated_at: now,
        generated_by: actorUserId,
        updated_at: now,
      });

      const payslips = [];

      for (const staff of activeStaff) {
        const resolved = await this.getEffectiveSalaryStructure(client, tenantId, staff.id, periodLastDay);
        if (!resolved) {
          continue; // no salary structure configured -- nothing to pay out yet
        }
        const { structure, components } = resolved;

        const staffDays = attendanceByStaff.get(staff.id) ?? new Map<string, string>();
        let daysPresent = 0;
        let daysLop = 0;
        for (const [iso, dayType] of Object.entries(dayTypes)) {
          if (dayType === "holiday") continue; // never present, never LOP, regardless of any attendance row
          const weight = 1; // a school-defined half-day still counts as a full working day
          const status = staffDays.get(iso);
          if (!status) continue; // unmarked = paid, not counted either way
          if (status === "present") daysPresent += weight;
          else if (status === "absent") daysLop += weight;
          else if (status === "half_day") {
            daysPresent += weight / 2;
            daysLop += weight / 2;
          }
          // leave: paid, not counted
        }

        const earningComponents = components
          .filter((c) => c.component_type === "earning")
          .reduce((sum, c) => sum + componentAmount(structure.basic_amount, { calculationType: c.calculation_type, amount: c.amount, percent: c.percent }), 0);
        const deductionComponents = components
          .filter((c) => c.component_type === "deduction")
          .reduce((sum, c) => sum + componentAmount(structure.basic_amount, { calculationType: c.calculation_type, amount: c.amount, percent: c.percent }), 0);

        const grossBeforeLop = structure.basic_amount + earningComponents;
        const lopAmount =
          workingDaysInPeriod > 0 ? Math.round((grossBeforeLop / workingDaysInPeriod) * daysLop) : 0;
        const grossEarnings = Math.max(grossBeforeLop - lopAmount, 0);
        const netPay = Math.max(grossEarnings - deductionComponents, 0);

        const payslip = await insertRow<PayslipRow>(client, "payslips", tenantId, {
          payroll_run_id: runId,
          staff_id: staff.id,
          days_in_month: workingDaysInPeriod,
          days_present: daysPresent,
          days_lop: daysLop,
          gross_earnings: grossEarnings,
          total_deductions: deductionComponents,
          net_pay: netPay,
          status: "draft",
          updated_at: now,
        });

        const lineItems: { id: string; component_name: string; component_type: string; amount: number }[] = [];
        const insertLineItem = async (name: string, type: string, amount: number) => {
          const item = await insertRow<PayslipLineItemRow>(client, "payslip_line_items", tenantId, {
            payslip_id: payslip.id,
            component_name: name,
            component_type: type,
            amount,
            updated_at: now,
          });
          lineItems.push({ id: item.id, component_name: name, component_type: type, amount });
        };

        await insertLineItem("Basic", "earning", structure.basic_amount);
        for (const c of components.filter((c) => c.component_type === "earning")) {
          await insertLineItem(c.component_name, "earning", componentAmount(structure.basic_amount, { calculationType: c.calculation_type, amount: c.amount, percent: c.percent }));
        }
        if (lopAmount > 0) {
          await insertLineItem("Loss of Pay", "deduction", lopAmount);
        }
        for (const c of components.filter((c) => c.component_type === "deduction")) {
          await insertLineItem(c.component_name, "deduction", componentAmount(structure.basic_amount, { calculationType: c.calculation_type, amount: c.amount, percent: c.percent }));
        }

        payslips.push({
          id: payslip.id,
          payroll_run_id: runId,
          staff_id: staff.id,
          staff_name: [staff.first_name, staff.last_name].filter(Boolean).join(" "),
          days_in_month: workingDaysInPeriod,
          days_present: daysPresent,
          days_lop: daysLop,
          gross_earnings: grossEarnings,
          total_deductions: deductionComponents,
          net_pay: netPay,
          status: "draft",
          paid_on: null,
          line_items: lineItems,
        });
      }

      await this.audit.record(client, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "payroll_runs",
        entityId: runId,
        action: "create",
        summary: `Generated payroll run for ${dto.period_year}-${String(dto.period_month).padStart(2, "0")} (${payslips.length} payslips)`,
      });

      return {
        run: {
          id: runId,
          branch_id: dto.branch_id,
          period_month: dto.period_month,
          period_year: dto.period_year,
          status: "draft",
          generated_at: now,
        },
        payslips,
      };
    });
  }

  listPayrollRuns(tenantId: string, branchId: string) {
    return this.db.query<PayrollRunRow>(
      tenantId,
      "SELECT * FROM payroll_runs WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL ORDER BY period_year DESC, period_month DESC",
      [tenantId, branchId],
    );
  }

  async getPayrollRun(tenantId: string, runId: string) {
    const run = await this.db.queryOne<PayrollRunRow>(
      tenantId,
      "SELECT * FROM payroll_runs WHERE id = $1 AND tenant_id = $2",
      [runId, tenantId],
    );
    if (!run) {
      throw new NotFoundException("payroll run not found");
    }

    const payslips = await this.db.query<PayslipRow & { first_name: string; last_name: string | null }>(
      tenantId,
      `SELECT p.*, s.first_name, s.last_name
       FROM payslips p
       JOIN staff s ON s.id = p.staff_id
       WHERE p.tenant_id = $1 AND p.payroll_run_id = $2 AND p.deleted_at IS NULL
       ORDER BY s.first_name ASC`,
      [tenantId, runId],
    );

    const lineItems = payslips.length
      ? await this.db.query<PayslipLineItemRow>(
          tenantId,
          "SELECT * FROM payslip_line_items WHERE tenant_id = $1 AND payslip_id = ANY($2) AND deleted_at IS NULL",
          [tenantId, payslips.map((p) => p.id)],
        )
      : [];
    const lineItemsByPayslip = new Map<string, PayslipLineItemRow[]>();
    for (const li of lineItems) {
      const list = lineItemsByPayslip.get(li.payslip_id) ?? [];
      list.push(li);
      lineItemsByPayslip.set(li.payslip_id, list);
    }

    return {
      run,
      payslips: payslips.map((p) => ({
        id: p.id,
        payroll_run_id: p.payroll_run_id,
        staff_id: p.staff_id,
        staff_name: [p.first_name, p.last_name].filter(Boolean).join(" "),
        days_in_month: p.days_in_month,
        days_present: p.days_present,
        days_lop: p.days_lop,
        gross_earnings: p.gross_earnings,
        total_deductions: p.total_deductions,
        net_pay: p.net_pay,
        status: p.status,
        paid_on: p.paid_on,
        line_items: (lineItemsByPayslip.get(p.id) ?? []).map((li) => ({
          id: li.id,
          component_name: li.component_name,
          component_type: li.component_type,
          amount: li.amount,
        })),
      })),
    };
  }

  async finalizePayrollRun(tenantId: string, actorUserId: string, runId: string) {
    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();

      const updated = await updateRow<PayrollRunRow>(client, "payroll_runs", tenantId, runId, {
        status: "finalized",
        updated_at: now,
      });

      await client.query(
        "UPDATE payslips SET status = 'finalized', updated_at = $1 WHERE tenant_id = $2 AND payroll_run_id = $3 AND deleted_at IS NULL",
        [now, tenantId, runId],
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "payroll_runs",
        entityId: runId,
        action: "update",
        summary: "Finalized payroll run",
      });

      return updated;
    });
  }

  // Draft-only, mirroring adjustLineItem's existing draft-only precedent --
  // a finalized run may already carry real payslip history, so it must go
  // through reopenPayrollRun (which itself blocks on paid payslips) before
  // it becomes eligible for delete.
  async deletePayrollRun(tenantId: string, actorUserId: string, runId: string) {
    return this.db.withTransaction(tenantId, async (client) => {
      const run = await findOneForTenant<PayrollRunRow>(client, "payroll_runs", tenantId, runId);
      if (!run) {
        throw new NotFoundException("payroll run not found");
      }
      if (run.status !== "draft") {
        throw new BadRequestException("only draft payroll runs can be deleted");
      }

      const now = new Date();

      const payslipsResult = await client.query<{ id: string }>(
        "SELECT id FROM payslips WHERE tenant_id = $1 AND payroll_run_id = $2 AND deleted_at IS NULL",
        [tenantId, runId],
      );
      const payslipIds = payslipsResult.rows.map((p) => p.id);

      if (payslipIds.length > 0) {
        await client.query(
          "UPDATE payslip_line_items SET deleted_at = $1, updated_at = $1 WHERE tenant_id = $2 AND payslip_id = ANY($3) AND deleted_at IS NULL",
          [now, tenantId, payslipIds],
        );
      }
      await client.query(
        "UPDATE payslips SET deleted_at = $1, updated_at = $1 WHERE tenant_id = $2 AND payroll_run_id = $3 AND deleted_at IS NULL",
        [now, tenantId, runId],
      );
      await updateRow<PayrollRunRow>(client, "payroll_runs", tenantId, runId, {
        deleted_at: now,
        updated_at: now,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: run.branch_id,
        actorUserId,
        entityTable: "payroll_runs",
        entityId: runId,
        action: "delete",
        summary: `Deleted draft payroll run for ${run.period_year}-${String(run.period_month).padStart(2, "0")}`,
      });
    });
  }

  // Finalized -> draft. Rejects if any payslip is already paid, so a real
  // payment record is never silently undone.
  async reopenPayrollRun(tenantId: string, actorUserId: string, runId: string) {
    return this.db.withTransaction(tenantId, async (client) => {
      const run = await findOneForTenant<PayrollRunRow>(client, "payroll_runs", tenantId, runId);
      if (!run) {
        throw new NotFoundException("payroll run not found");
      }
      if (run.status !== "finalized") {
        throw new BadRequestException("only finalized payroll runs can be reopened");
      }

      const paidCountResult = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM payslips WHERE tenant_id = $1 AND payroll_run_id = $2 AND status = 'paid' AND deleted_at IS NULL",
        [tenantId, runId],
      );
      if (Number(paidCountResult.rows[0]?.count ?? "0") > 0) {
        throw new BadRequestException("cannot reopen a run that has paid payslips");
      }

      const now = new Date();

      await updateRow<PayrollRunRow>(client, "payroll_runs", tenantId, runId, {
        status: "draft",
        updated_at: now,
      });
      await client.query(
        "UPDATE payslips SET status = 'draft', updated_at = $1 WHERE tenant_id = $2 AND payroll_run_id = $3 AND deleted_at IS NULL",
        [now, tenantId, runId],
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "payroll_runs",
        entityId: runId,
        action: "update",
        summary: "Reopened payroll run for editing",
      });
    });
  }

  async markPayslipPaid(tenantId: string, actorUserId: string, payslipId: string, paidOn: string) {
    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<PayslipRow>(client, "payslips", tenantId, payslipId, {
        status: "paid",
        paid_on: new Date(paidOn),
        updated_at: new Date(),
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "payslips",
        entityId: payslipId,
        action: "update",
        summary: "Marked payslip paid",
      });

      return updated;
    });
  }

  // Adds or updates a manual line item on a still-draft payslip, then
  // recomputes the payslip's totals from the full set of line items.
  async adjustLineItem(tenantId: string, actorUserId: string, payslipId: string, dto: AdjustLineItemDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const payslip = await findOneForTenant<PayslipRow>(client, "payslips", tenantId, payslipId);
      if (!payslip) {
        throw new NotFoundException("payslip not found");
      }
      if (payslip.status !== "draft") {
        throw new BadRequestException("only draft payslips can be adjusted");
      }

      const now = new Date();

      const existingResult = await client.query<PayslipLineItemRow>(
        "SELECT * FROM payslip_line_items WHERE tenant_id = $1 AND payslip_id = $2 AND component_name = $3 AND deleted_at IS NULL",
        [tenantId, payslipId, dto.component_name],
      );
      const existing = existingResult.rows[0];

      if (existing) {
        await updateRow<PayslipLineItemRow>(client, "payslip_line_items", tenantId, existing.id, {
          amount: dto.amount,
          component_type: dto.component_type,
          updated_at: now,
        });
      } else {
        await insertRow<PayslipLineItemRow>(client, "payslip_line_items", tenantId, {
          payslip_id: payslipId,
          component_name: dto.component_name,
          component_type: dto.component_type,
          amount: dto.amount,
          updated_at: now,
        });
      }

      const itemsResult = await client.query<PayslipLineItemRow>(
        "SELECT * FROM payslip_line_items WHERE tenant_id = $1 AND payslip_id = $2 AND deleted_at IS NULL",
        [tenantId, payslipId],
      );
      const gross = itemsResult.rows.filter((i) => i.component_type === "earning").reduce((sum, i) => sum + i.amount, 0);
      const deductions = itemsResult.rows.filter((i) => i.component_type === "deduction").reduce((sum, i) => sum + i.amount, 0);
      const netPay = Math.max(gross - deductions, 0);

      const updated = await updateRow<PayslipRow>(client, "payslips", tenantId, payslipId, {
        gross_earnings: gross,
        total_deductions: deductions,
        net_pay: netPay,
        updated_at: now,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "payslips",
        entityId: payslipId,
        action: "update",
        summary: `Adjusted line item '${dto.component_name}'`,
      });

      return updated;
    });
  }
}
