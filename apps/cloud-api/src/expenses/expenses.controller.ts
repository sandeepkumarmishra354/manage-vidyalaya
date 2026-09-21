import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { ModuleAccessGuard } from "../common/module-access.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequireModule } from "../common/require-module.decorator.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { RequestUploadUrlDto } from "../documents/dto/request-upload-url.dto.js";
import { AttachReceiptDto } from "./dto/attach-receipt.dto.js";
import { CreateExpenseDto } from "./dto/create-expense.dto.js";
import { UpdateExpenseDto } from "./dto/update-expense.dto.js";
import { ExpensesService } from "./expenses.service.js";

@Controller("expenses")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard, ModuleAccessGuard)
@RequireModule("expenses")
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @RequirePermission("expenses.view")
  list(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("category_id") categoryId?: string,
  ) {
    return this.expenses.list(user.tenant_id, branchId, from, to, categoryId);
  }

  @Get("reports/summary")
  @RequirePermission("expenses.view")
  summary(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.expenses.summary(user.tenant_id, branchId, from, to);
  }

  @Post()
  @RequirePermission("expenses.manage")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(user.tenant_id, user.sub, dto);
  }

  @Patch(":id")
  @RequirePermission("expenses.manage")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenses.update(user.tenant_id, user.sub, id, dto, user.branch_id);
  }

  @Delete(":id")
  @RequirePermission("expenses.manage")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.expenses.remove(user.tenant_id, user.sub, id, user.branch_id);
  }

  @Post(":id/receipt-upload-url")
  @RequirePermission("expenses.manage")
  requestReceiptUploadUrl(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: RequestUploadUrlDto) {
    return this.expenses.requestReceiptUploadUrl(user.tenant_id, id, dto, user.branch_id);
  }

  @Patch(":id/receipt")
  @RequirePermission("expenses.manage")
  attachReceipt(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: AttachReceiptDto) {
    return this.expenses.attachReceipt(user.tenant_id, user.sub, id, dto.storage_key, user.branch_id);
  }

  @Get(":id/receipt-download-url")
  @RequirePermission("expenses.view")
  getReceiptDownloadUrl(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.expenses.getReceiptDownloadUrl(user.tenant_id, id, user.branch_id);
  }
}
