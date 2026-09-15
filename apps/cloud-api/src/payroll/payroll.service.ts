import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
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
  ) {}

  async getSalaryStructure(staffId: string) {
    const structure = await this.prisma.salaryStructure.findFirst({
      where: { staffId, deletedAt: null },
      orderBy: { effectiveFrom: "desc" },
      include: { salaryComponents: { where: { deletedAt: null } } },
    });
    if (!structure) {
      return null;
    }

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

  // Replaces a staff member's salary structure wholesale: soft-deletes any
  // prior structure/components and inserts a fresh set.
  async setSalaryStructure(tenantId: string, actorUserId: string, dto: SetSalaryStructureDto) {
    const now = new Date();
    const structureId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const priorStructures = await tx.salaryStructure.findMany({
        where: { staffId: dto.staff_id, deletedAt: null },
        select: { id: true },
      });

      for (const prior of priorStructures) {
        await tx.salaryStructure.update({
          where: { id: prior.id },
          data: { deletedAt: now, updatedAt: now, version: { increment: 1 } },
        });
        await tx.salaryComponent.updateMany({
          where: { salaryStructureId: prior.id },
          data: { deletedAt: now, updatedAt: now },
        });
      }

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
  // active staff member who has a salary structure. Loss-of-pay days are
  // derived from staff_attendance for the period: present = full paid day,
  // half_day = half paid/half LOP, absent = full LOP, leave/holiday = paid
  // (not counted). Days with no attendance record are not penalized.
  // PF/ESI/Professional-Tax/TDS are whatever the salary structure's
  // deduction components say, not computed against government slabs.
  async generatePayrollRun(tenantId: string, actorUserId: string, dto: GeneratePayrollRunDto) {
    const runId = randomUUID();
    const now = new Date();
    const totalDaysInMonth = daysInMonth(dto.period_year, dto.period_month);

    const periodStart = new Date(Date.UTC(dto.period_year, dto.period_month - 1, 1));
    const periodEnd =
      dto.period_month === 12
        ? new Date(Date.UTC(dto.period_year + 1, 0, 1))
        : new Date(Date.UTC(dto.period_year, dto.period_month, 1));

    const activeStaff = await this.prisma.staff.findMany({
      where: { branchId: dto.branch_id, status: "active", deletedAt: null },
    });

    return this.prisma.$transaction(async (tx) => {
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
        const structure = await tx.salaryStructure.findFirst({
          where: { staffId: staff.id, deletedAt: null },
          orderBy: { effectiveFrom: "desc" },
          include: { salaryComponents: { where: { deletedAt: null } } },
        });
        if (!structure) {
          continue; // no salary structure configured -- nothing to pay out yet
        }

        const attendance = await tx.staffAttendance.groupBy({
          by: ["status"],
          where: { staffId: staff.id, deletedAt: null, attendanceDate: { gte: periodStart, lt: periodEnd } },
          _count: { status: true },
        });
        const countByStatus = new Map(attendance.map((a) => [a.status, a._count.status]));
        const presentDays = countByStatus.get("present") ?? 0;
        const halfDays = countByStatus.get("half_day") ?? 0;
        const absentDays = countByStatus.get("absent") ?? 0;

        const daysPresent = presentDays + halfDays * 0.5;
        const daysLop = absentDays + halfDays * 0.5;

        const earningComponents = structure.salaryComponents
          .filter((c) => c.componentType === "earning")
          .reduce((sum, c) => sum + componentAmount(structure.basicAmount, c), 0);
        const deductionComponents = structure.salaryComponents
          .filter((c) => c.componentType === "deduction")
          .reduce((sum, c) => sum + componentAmount(structure.basicAmount, c), 0);

        const grossBeforeLop = structure.basicAmount + earningComponents;
        const lopAmount =
          totalDaysInMonth > 0 ? Math.round((grossBeforeLop / totalDaysInMonth) * daysLop) : 0;
        const grossEarnings = Math.max(grossBeforeLop - lopAmount, 0);
        const netPay = Math.max(grossEarnings - deductionComponents, 0);

        const payslipId = randomUUID();
        await tx.payslip.create({
          data: {
            id: payslipId,
            tenantId,
            payrollRunId: runId,
            staffId: staff.id,
            daysInMonth: totalDaysInMonth,
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
          days_in_month: totalDaysInMonth,
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
