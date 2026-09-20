import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsString } from "class-validator";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { AdjustLineItemDto } from "./dto/adjust-line-item.dto.js";
import { GeneratePayrollRunDto } from "./dto/generate-payroll-run.dto.js";
import { SetSalaryStructureDto } from "./dto/set-salary-structure.dto.js";
import { PayrollService } from "./payroll.service.js";

class MarkPaidDto {
  @IsString()
  paid_on!: string;
}

@Controller("salary-structures")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class SalaryStructuresController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get("staff/:staffId")
  @RequirePermission("payroll.view")
  get(@CurrentUser() user: JwtPayload, @Param("staffId") staffId: string) {
    return this.payrollService.getSalaryStructure(user.tenant_id, staffId);
  }

  @Get("staff/:staffId/history")
  @RequirePermission("payroll.view")
  history(@CurrentUser() user: JwtPayload, @Param("staffId") staffId: string) {
    return this.payrollService.listSalaryHistory(user.tenant_id, staffId);
  }

  @Post()
  @RequirePermission("payroll.manage_salary_structure")
  set(@CurrentUser() user: JwtPayload, @Body() dto: SetSalaryStructureDto) {
    return this.payrollService.setSalaryStructure(user.tenant_id, user.sub, dto);
  }
}

@Controller("payroll-runs")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class PayrollRunsController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  @RequirePermission("payroll.view")
  list(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string) {
    return this.payrollService.listPayrollRuns(user.tenant_id, branchId);
  }

  // Registered before ":id" so "report" isn't swallowed as a run id.
  @Get("report")
  @RequirePermission("payroll.view")
  report(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("from_date") fromDate: string,
    @Query("to_date") toDate: string,
  ) {
    return this.payrollService.getReport(user.tenant_id, branchId, fromDate, toDate);
  }

  @Post("generate")
  @RequirePermission("payroll.generate")
  generate(@CurrentUser() user: JwtPayload, @Body() dto: GeneratePayrollRunDto) {
    return this.payrollService.generatePayrollRun(user.tenant_id, user.sub, dto);
  }

  @Get(":id")
  @RequirePermission("payroll.view")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.payrollService.getPayrollRun(user.tenant_id, id);
  }

  @Post(":id/finalize")
  @RequirePermission("payroll.finalize")
  finalize(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.payrollService.finalizePayrollRun(user.tenant_id, user.sub, id);
  }

  @Delete(":id")
  @RequirePermission("payroll.manage_runs")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.payrollService.deletePayrollRun(user.tenant_id, user.sub, id);
  }

  @Post(":id/reopen")
  @RequirePermission("payroll.manage_runs")
  reopen(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.payrollService.reopenPayrollRun(user.tenant_id, user.sub, id);
  }
}

@Controller("payslips")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class PayslipsController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post(":id/mark-paid")
  @RequirePermission("payroll.finalize")
  markPaid(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: MarkPaidDto) {
    return this.payrollService.markPayslipPaid(user.tenant_id, user.sub, id, dto.paid_on);
  }

  @Post(":id/line-items")
  @RequirePermission("payroll.generate")
  adjustLineItem(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: AdjustLineItemDto) {
    return this.payrollService.adjustLineItem(user.tenant_id, user.sub, id, dto);
  }
}
