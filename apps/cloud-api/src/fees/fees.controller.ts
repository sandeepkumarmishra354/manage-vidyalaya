import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CarryForwardStructuresDto } from "./dto/carry-forward-structures.dto.js";
import { CreateFeeStructureDto } from "./dto/create-fee-structure.dto.js";
import { EditInvoiceDto } from "./dto/edit-invoice.dto.js";
import { EditPaymentDto } from "./dto/edit-payment.dto.js";
import { GenerateInvoicesDto } from "./dto/generate-invoices.dto.js";
import { GenerateInvoicesBulkDto } from "./dto/generate-invoices-bulk.dto.js";
import { RecordPaymentBatchDto } from "./dto/record-payment-batch.dto.js";
import { RecordPaymentDto } from "./dto/record-payment.dto.js";
import { ReversePaymentDto } from "./dto/reverse-payment.dto.js";
import { SetStudentFeeAssignmentDto } from "./dto/set-student-fee-assignment.dto.js";
import { UpdateFeeStructureDto } from "./dto/update-fee-structure.dto.js";
import { VoidInvoiceDto } from "./dto/void-invoice.dto.js";
import { FeesService } from "./fees.service.js";

@Controller("fee-structures")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class FeeStructuresController {
  constructor(private readonly feesService: FeesService) {}

  @Get()
  @RequirePermission("fees.view")
  list(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("fee_type") feeType?: string,
    @Query("class_id") classId?: string,
  ) {
    return this.feesService.listFeeStructures(user.tenant_id, branchId, feeType, classId);
  }

  @Post()
  @RequirePermission("fees.manage_structures")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateFeeStructureDto) {
    return this.feesService.createFeeStructure(user.tenant_id, dto);
  }

  @Patch(":id")
  @RequirePermission("fees.manage_structures")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateFeeStructureDto) {
    return this.feesService.updateFeeStructure(user.tenant_id, user.sub, id, dto);
  }

  @Post(":id/generate-invoices")
  @RequirePermission("fees.generate_invoices")
  async generateInvoices(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: GenerateInvoicesDto) {
    const created = await this.feesService.generateInvoices(user.tenant_id, id, undefined, dto.up_to_period);
    return { created };
  }

  @Post("generate-invoices-bulk")
  @RequirePermission("fees.generate_invoices")
  generateInvoicesBulk(@CurrentUser() user: JwtPayload, @Body() dto: GenerateInvoicesBulkDto) {
    return this.feesService.generateInvoicesBulk(
      user.tenant_id,
      user.sub,
      dto.branch_id,
      dto.academic_session_id,
      dto.fee_structure_ids,
      dto.up_to_period,
    );
  }

  @Post("carry-forward")
  @RequirePermission("fees.manage_structures")
  carryForward(@CurrentUser() user: JwtPayload, @Body() dto: CarryForwardStructuresDto) {
    return this.feesService.carryForwardStructures(user.tenant_id, user.sub, dto);
  }

  @Get(":id/student-assignments")
  @RequirePermission("fees.view")
  listAssignments(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.feesService.listStructureAssignments(user.tenant_id, id);
  }
}

@Controller("fee-invoices")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class FeeInvoicesController {
  constructor(private readonly feesService: FeesService) {}

  @Get()
  @RequirePermission("fees.view")
  list(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("status") status?: string,
    @Query("fee_type") feeType?: string,
    @Query("class_id") classId?: string,
  ) {
    return this.feesService.listInvoices(user.tenant_id, branchId, status, feeType, classId);
  }

  @Get("student/:studentId/summary")
  @RequirePermission("fees.view")
  summary(@CurrentUser() user: JwtPayload, @Param("studentId") studentId: string) {
    return this.feesService.getStudentFeeSummary(user.tenant_id, studentId);
  }

  @Post(":id/void")
  @RequirePermission("fees.void_invoice")
  void_(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: VoidInvoiceDto) {
    return this.feesService.voidInvoice(user.tenant_id, user.sub, id, dto.reason);
  }

  @Patch(":id")
  @RequirePermission("fees.void_invoice")
  edit(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: EditInvoiceDto) {
    return this.feesService.editInvoice(user.tenant_id, user.sub, id, dto);
  }
}

@Controller("fee-payments")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class FeePaymentsController {
  constructor(private readonly feesService: FeesService) {}

  @Get()
  @RequirePermission("fees.view")
  list(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("student_id") studentId?: string,
    @Query("receipt_number") receiptNumber?: string,
  ) {
    return this.feesService.listPayments(user.tenant_id, branchId, { from, to, studentId, receiptNumber });
  }

  @Get("receipt/:receiptNumber")
  @RequirePermission("fees.view")
  receipt(@CurrentUser() user: JwtPayload, @Param("receiptNumber") receiptNumber: string) {
    return this.feesService.getPaymentReceipt(user.tenant_id, receiptNumber);
  }

  @Post()
  @RequirePermission("fees.record_payment")
  record(@CurrentUser() user: JwtPayload, @Body() dto: RecordPaymentDto) {
    return this.feesService.recordPayment(user.tenant_id, user.sub, dto);
  }

  @Post("batch")
  @RequirePermission("fees.record_payment")
  recordBatch(@CurrentUser() user: JwtPayload, @Body() dto: RecordPaymentBatchDto) {
    return this.feesService.recordPaymentBatch(user.tenant_id, user.sub, dto);
  }

  @Post(":id/reverse")
  @RequirePermission("fees.record_payment")
  reverse(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: ReversePaymentDto) {
    return this.feesService.reversePayment(user.tenant_id, user.sub, id, dto.reason);
  }

  @Patch(":id")
  @RequirePermission("fees.record_payment")
  edit(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: EditPaymentDto) {
    return this.feesService.editPayment(user.tenant_id, user.sub, id, dto);
  }
}

@Controller("student-fee-assignments")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class StudentFeeAssignmentsController {
  constructor(private readonly feesService: FeesService) {}

  @Post()
  @RequirePermission("fees.manage_structures")
  create(@CurrentUser() user: JwtPayload, @Body() dto: SetStudentFeeAssignmentDto) {
    return this.feesService.setStudentFeeAssignment(user.tenant_id, user.sub, dto);
  }

  @Delete(":id")
  @RequirePermission("fees.manage_structures")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.feesService.removeStudentFeeAssignment(user.tenant_id, user.sub, id);
  }
}

@Controller("students")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class StudentFeeAssignmentsQueryController {
  constructor(private readonly feesService: FeesService) {}

  @Get(":id/fee-assignments")
  @RequirePermission("fees.view")
  list(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.feesService.listStudentFeeAssignments(user.tenant_id, id);
  }
}
