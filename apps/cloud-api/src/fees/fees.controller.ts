import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CreateFeeStructureDto } from "./dto/create-fee-structure.dto.js";
import { RecordPaymentDto } from "./dto/record-payment.dto.js";
import { ReversePaymentDto } from "./dto/reverse-payment.dto.js";
import { UpdateFeeStructureDto } from "./dto/update-fee-structure.dto.js";
import { VoidInvoiceDto } from "./dto/void-invoice.dto.js";
import { FeesService } from "./fees.service.js";

@Controller("fee-structures")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FeeStructuresController {
  constructor(private readonly feesService: FeesService) {}

  @Get()
  @RequirePermission("fees.view")
  list(@Query("branch_id") branchId: string, @Query("fee_type") feeType?: string, @Query("class_id") classId?: string) {
    return this.feesService.listFeeStructures(branchId, feeType, classId);
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
  async generateInvoices(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    const created = await this.feesService.generateInvoices(user.tenant_id, id);
    return { created };
  }
}

@Controller("fee-invoices")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FeeInvoicesController {
  constructor(private readonly feesService: FeesService) {}

  @Get()
  @RequirePermission("fees.view")
  list(
    @Query("branch_id") branchId: string,
    @Query("status") status?: string,
    @Query("fee_type") feeType?: string,
    @Query("class_id") classId?: string,
  ) {
    return this.feesService.listInvoices(branchId, status, feeType, classId);
  }

  @Get("student/:studentId/summary")
  @RequirePermission("fees.view")
  summary(@Param("studentId") studentId: string) {
    return this.feesService.getStudentFeeSummary(studentId);
  }

  @Post(":id/void")
  @RequirePermission("fees.void_invoice")
  void_(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: VoidInvoiceDto) {
    return this.feesService.voidInvoice(user.tenant_id, user.sub, id, dto.reason);
  }
}

@Controller("fee-payments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FeePaymentsController {
  constructor(private readonly feesService: FeesService) {}

  @Post()
  @RequirePermission("fees.record_payment")
  record(@CurrentUser() user: JwtPayload, @Body() dto: RecordPaymentDto) {
    return this.feesService.recordPayment(user.tenant_id, user.sub, dto);
  }

  @Post(":id/reverse")
  @RequirePermission("fees.record_payment")
  reverse(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: ReversePaymentDto) {
    return this.feesService.reversePayment(user.tenant_id, user.sub, id, dto.reason);
  }
}
