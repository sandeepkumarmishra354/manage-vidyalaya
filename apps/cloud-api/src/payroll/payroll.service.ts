import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService, type AuditableClient } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { dayWeight, SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import type { AdjustLineItemDto } from "./dto/adjust-line-item.dto.js";
import type { GeneratePayrollRunDto } from "./dto/generate-payroll-run.dto.js";
import type { SetSalaryStructureDto } from "./dto/set-salary-structure.dto.js";

export interface ComponentLike {
  calculationType: string;
  amount: number | null;
  percent: number | null;
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
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly schoolCalendar: SchoolCalendarService,
  ) {}

  // "The structure that was in force on this date" -- the most recent
  // structure whose effective_from is on or before asOfDate. Accepts either
  // the plain PrismaService or a $transaction client, since
  // generatePayrollRun needs this resolved consistently inside its own
  // transaction rather than against a separate connection.
  async getEffectiveSalaryStructure(client: AuditableClient, staffId: string, asOfDate: Date) {
    return client.salaryStructure.findFirst({
      where: { staffId, deletedAt: null, effectiveFrom: { lte: asOfDate } },
      orderBy: { effectiveFrom: "desc" },
      include: { salaryComponents: { where: { deletedAt: null } } },
    });
  }

  private formatStructure(structure: {
    id: string;
    staffId: string;
    effectiveFrom: Date;
    basicAmount: number;
    salaryComponents: {
      id: string;
      componentName: string;
      componentType: string;
      calculationType: string;
      amount: number | null;
      percent: number | null;
    }[];
  }) {
    return {
      id: structure.id,
      staff_id: structure.staffId,
      effective_from: structure.effectiveFrom,
      basic_amount: structure.basicAmount,
      components: structure.salaryComponents.map((c) => ({
        id: c.id,
        component_name: c.componentName,
        component_type: c.componentType,
        calculation_type: c.calculationType,
        amount: c.amount,
        percent: c.percent,
      })),
    };
  }

  async getSalaryStructure(staffId: string) {
    const structure = await this.getEffectiveSalaryStructure(this.prisma, staffId, new Date());
    return structure ? this.formatStructure(structure) : null;
  }

  // Every historical structure a staff member has ever had, most recent
  // first -- the increment history behind the "current" one getSalaryStructure
  // returns.
  async listSalaryHistory(staffId: string) {
    const structures = await this.prisma.salaryStructure.findMany({
      where: { staffId, deletedAt: null },
      orderBy: { effectiveFrom: "desc" },
      include: { salaryComponents: { where: { deletedAt: null } } },
    });
    return structures.map((s) => this.formatStructure(s));
  }

  // Records a new salary structure effective from dto.effective_from. This
  // is an increment, not a replacement -- prior structures are left alone
  // (never soft-deleted) so getEffectiveSalaryStructure/listSalaryHistory
  // can resolve whichever one was in force for any given date, including
  // past payroll runs that must keep using the structure that applied then.
  async setSalaryStructure(tenantId: string, actorUserId: string, dto: SetSalaryStructureDto) {
    const now = new Date();
    const structureId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      await tx.salaryStructure.create({
        data: {
          id: structureId,
          tenantId,
          branchId: dto.branch_id,
          staffId: dto.staff_id,
          effectiveFrom: new Date(dto.effective_from),
          basicAmount: dto.basic_amount,
          updatedAt: now,
        },
      });

      for (const component of dto.components) {
        await tx.salaryComponent.create({
          data: {
            id: randomUUID(),
            tenantId,
            salaryStructureId: structureId,
            componentName: component.component_name,
            componentType: component.component_type,
            calculationType: component.calculation_type,
            amount: component.amount ?? null,
            percent: component.percent ?? null,
            updatedAt: now,
          },
        });
      }

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "salary_structures",
        entityId: structureId,
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
    const runId = randomUUID();
    const now = new Date();

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

    const activeStaff = await this.prisma.staff.findMany({
      where: { branchId: dto.branch_id, status: "active", deletedAt: null },
    });

    return this.prisma.$transaction(async (tx) => {
      const attendanceRecords = await tx.staffAttendance.findMany({
        where: { branchId: dto.branch_id, deletedAt: null, attendanceDate: { gte: periodStart, lt: periodEnd } },
      });
      const attendanceByStaff = new Map<string, Map<string, string>>();
      for (const record of attendanceRecords) {
        const iso = record.attendanceDate.toISOString().slice(0, 10);
        const staffDays = attendanceByStaff.get(record.staffId) ?? new Map<string, string>();
        staffDays.set(iso, record.status);
        attendanceByStaff.set(record.staffId, staffDays);
      }

      await tx.payrollRun.create({
        data: {
          id: runId,
          tenantId,
          branchId: dto.branch_id,
          periodMonth: dto.period_month,
          periodYear: dto.period_year,
          status: "draft",
          generatedAt: now,
          generatedBy: actorUserId,
          updatedAt: now,
        },
      });

      const payslips = [];

      for (const staff of activeStaff) {
        const structure = await this.getEffectiveSalaryStructure(tx, staff.id, periodLastDay);
        if (!structure) {
          continue; // no salary structure configured -- nothing to pay out yet
        }

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

        const earningComponents = structure.salaryComponents
          .filter((c) => c.componentType === "earning")
          .reduce((sum, c) => sum + componentAmount(structure.basicAmount, c), 0);
        const deductionComponents = structure.salaryComponents
          .filter((c) => c.componentType === "deduction")
          .reduce((sum, c) => sum + componentAmount(structure.basicAmount, c), 0);

        const grossBeforeLop = structure.basicAmount + earningComponents;
        const lopAmount =
          workingDaysInPeriod > 0 ? Math.round((grossBeforeLop / workingDaysInPeriod) * daysLop) : 0;
        const grossEarnings = Math.max(grossBeforeLop - lopAmount, 0);
        const netPay = Math.max(grossEarnings - deductionComponents, 0);

        const payslipId = randomUUID();
        await tx.payslip.create({
          data: {
            id: payslipId,
            tenantId,
            payrollRunId: runId,
            staffId: staff.id,
            daysInMonth: workingDaysInPeriod,
            daysPresent,
            daysLop,
            grossEarnings,
            totalDeductions: deductionComponents,
            netPay,
            status: "draft",
            updatedAt: now,
          },
        });

        const lineItems: { id: string; component_name: string; component_type: string; amount: number }[] = [];
        const insertLineItem = async (name: string, type: string, amount: number) => {
          const id = randomUUID();
          await tx.payslipLineItem.create({
            data: { id, tenantId, payslipId, componentName: name, componentType: type, amount, updatedAt: now },
          });
          lineItems.push({ id, component_name: name, component_type: type, amount });
        };

        await insertLineItem("Basic", "earning", structure.basicAmount);
        for (const c of structure.salaryComponents.filter((c) => c.componentType === "earning")) {
          await insertLineItem(c.componentName, "earning", componentAmount(structure.basicAmount, c));
        }
        if (lopAmount > 0) {
          await insertLineItem("Loss of Pay", "deduction", lopAmount);
        }
        for (const c of structure.salaryComponents.filter((c) => c.componentType === "deduction")) {
          await insertLineItem(c.componentName, "deduction", componentAmount(structure.basicAmount, c));
        }

        payslips.push({
          id: payslipId,
          payroll_run_id: runId,
          staff_id: staff.id,
          staff_name: [staff.firstName, staff.lastName].filter(Boolean).join(" "),
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

      await this.audit.record(tx, {
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

  listPayrollRuns(branchId: string) {
    return this.prisma.payrollRun.findMany({
      where: { branchId, deletedAt: null },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    });
  }

  async getPayrollRun(runId: string) {
    const run = await this.prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
    const payslips = await this.prisma.payslip.findMany({
      where: { payrollRunId: runId, deletedAt: null },
      include: { staff: true, lineItems: { where: { deletedAt: null } } },
      orderBy: { staff: { firstName: "asc" } },
    });

    return {
      run,
      payslips: payslips.map((p) => ({
        id: p.id,
        payroll_run_id: p.payrollRunId,
        staff_id: p.staffId,
        staff_name: [p.staff.firstName, p.staff.lastName].filter(Boolean).join(" "),
        days_in_month: p.daysInMonth,
        days_present: p.daysPresent,
        days_lop: p.daysLop,
        gross_earnings: p.grossEarnings,
        total_deductions: p.totalDeductions,
        net_pay: p.netPay,
        status: p.status,
        paid_on: p.paidOn,
        line_items: p.lineItems.map((li) => ({
          id: li.id,
          component_name: li.componentName,
          component_type: li.componentType,
          amount: li.amount,
        })),
      })),
    };
  }

  async finalizePayrollRun(tenantId: string, actorUserId: string, runId: string) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.payrollRun.update({
        where: { id: runId },
        data: { status: "finalized", updatedAt: now, version: { increment: 1 } },
      });
      await tx.payslip.updateMany({
        where: { payrollRunId: runId },
        data: { status: "finalized", updatedAt: now },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "payroll_runs",
        entityId: runId,
        action: "update",
        summary: "Finalized payroll run",
      });
    });
  }

  // Draft-only, mirroring adjustLineItem's existing draft-only precedent --
  // a finalized run may already carry real payslip history, so it must go
  // through reopenPayrollRun (which itself blocks on paid payslips) before
  // it becomes eligible for delete.
  async deletePayrollRun(tenantId: string, actorUserId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id: runId, tenantId, deletedAt: null } });
    if (!run) {
      throw new NotFoundException("payroll run not found");
    }
    if (run.status !== "draft") {
      throw new BadRequestException("only draft payroll runs can be deleted");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const payslips = await tx.payslip.findMany({
        where: { payrollRunId: runId, deletedAt: null },
        select: { id: true },
      });

      for (const payslip of payslips) {
        await tx.payslipLineItem.updateMany({
          where: { payslipId: payslip.id, deletedAt: null },
          data: { deletedAt: now, updatedAt: now },
        });
      }
      await tx.payslip.updateMany({
        where: { payrollRunId: runId, deletedAt: null },
        data: { deletedAt: now, updatedAt: now },
      });
      await tx.payrollRun.update({
        where: { id: runId },
        data: { deletedAt: now, updatedAt: now, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: run.branchId,
        actorUserId,
        entityTable: "payroll_runs",
        entityId: runId,
        action: "delete",
        summary: `Deleted draft payroll run for ${run.periodYear}-${String(run.periodMonth).padStart(2, "0")}`,
      });
    });
  }

  // Finalized -> draft. Rejects if any payslip is already paid, so a real
  // payment record is never silently undone.
  async reopenPayrollRun(tenantId: string, actorUserId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id: runId, tenantId, deletedAt: null } });
    if (!run) {
      throw new NotFoundException("payroll run not found");
    }
    if (run.status !== "finalized") {
      throw new BadRequestException("only finalized payroll runs can be reopened");
    }

    const paidCount = await this.prisma.payslip.count({
      where: { payrollRunId: runId, status: "paid", deletedAt: null },
    });
    if (paidCount > 0) {
      throw new BadRequestException("cannot reopen a run that has paid payslips");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.payrollRun.update({
        where: { id: runId },
        data: { status: "draft", updatedAt: now, version: { increment: 1 } },
      });
      await tx.payslip.updateMany({
        where: { payrollRunId: runId, deletedAt: null },
        data: { status: "draft", updatedAt: now },
      });

      await this.audit.record(tx, {
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
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payslip.update({
        where: { id: payslipId },
        data: { status: "paid", paidOn: new Date(paidOn), updatedAt: now, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
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
    const payslip = await this.prisma.payslip.findUniqueOrThrow({ where: { id: payslipId } });
    if (payslip.status !== "draft") {
      throw new BadRequestException("only draft payslips can be adjusted");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.payslipLineItem.findFirst({
        where: { payslipId, componentName: dto.component_name, deletedAt: null },
      });

      if (existing) {
        await tx.payslipLineItem.update({
          where: { id: existing.id },
          data: { amount: dto.amount, componentType: dto.component_type, updatedAt: now, version: { increment: 1 } },
        });
      } else {
        await tx.payslipLineItem.create({
          data: {
            id: randomUUID(),
            tenantId,
            payslipId,
            componentName: dto.component_name,
            componentType: dto.component_type,
            amount: dto.amount,
            updatedAt: now,
          },
        });
      }

      const items = await tx.payslipLineItem.findMany({ where: { payslipId, deletedAt: null } });
      const gross = items.filter((i) => i.componentType === "earning").reduce((sum, i) => sum + i.amount, 0);
      const deductions = items.filter((i) => i.componentType === "deduction").reduce((sum, i) => sum + i.amount, 0);
      const netPay = Math.max(gross - deductions, 0);

      const updated = await tx.payslip.update({
        where: { id: payslipId },
        data: { grossEarnings: gross, totalDeductions: deductions, netPay, updatedAt: now, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
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
