import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { AssignDiscountDto } from "./dto/assign-discount.dto.js";
import { CreateFeeDiscountDto } from "./dto/create-fee-discount.dto.js";
import { UpdateFeeDiscountDto } from "./dto/update-fee-discount.dto.js";
import { FeeDiscountsService } from "./fee-discounts.service.js";

@Controller("fee-discounts")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FeeDiscountsController {
  constructor(private readonly feeDiscountsService: FeeDiscountsService) {}

  @Get()
  @RequirePermission("fees.view")
  list(@CurrentUser() user: JwtPayload) {
    return this.feeDiscountsService.listDiscounts(user.tenant_id);
  }

  @Post()
  @RequirePermission("fees.manage_discounts")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateFeeDiscountDto) {
    return this.feeDiscountsService.createDiscount(user.tenant_id, user.sub, dto);
  }

  @Patch(":id")
  @RequirePermission("fees.manage_discounts")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateFeeDiscountDto) {
    return this.feeDiscountsService.updateDiscount(user.tenant_id, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermission("fees.manage_discounts")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.feeDiscountsService.deleteDiscount(user.tenant_id, user.sub, id);
  }

  @Get(":id/assignees")
  @RequirePermission("fees.view")
  assignees(@Param("id") id: string) {
    return this.feeDiscountsService.listDiscountAssignees(id);
  }

  @Post(":id/assign")
  @RequirePermission("fees.manage_discounts")
  assign(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: AssignDiscountDto) {
    return this.feeDiscountsService.assignDiscountToStudents(user.tenant_id, user.sub, id, dto);
  }

  @Delete("assignments/:assignmentId")
  @RequirePermission("fees.manage_discounts")
  removeAssignment(@CurrentUser() user: JwtPayload, @Param("assignmentId") assignmentId: string) {
    return this.feeDiscountsService.removeDiscountAssignment(user.tenant_id, user.sub, assignmentId);
  }

  @Get("suggest-siblings/:studentId")
  @RequirePermission("fees.view")
  suggestSiblings(@Param("studentId") studentId: string) {
    return this.feeDiscountsService.suggestSiblingsForDiscount(studentId);
  }
}

@Controller("students")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StudentFeeDiscountsQueryController {
  constructor(private readonly feeDiscountsService: FeeDiscountsService) {}

  @Get(":id/fee-discounts")
  @RequirePermission("fees.view")
  list(@Param("id") id: string) {
    return this.feeDiscountsService.listStudentDiscounts(id);
  }
}
