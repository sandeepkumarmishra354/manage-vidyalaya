import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CreateFeeCategoryDto } from "./dto/create-fee-category.dto.js";
import { UpdateFeeCategoryDto } from "./dto/update-fee-category.dto.js";
import { FeeCategoriesService } from "./fee-categories.service.js";

@Controller("fee-categories")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FeeCategoriesController {
  constructor(private readonly feeCategoriesService: FeeCategoriesService) {}

  @Get()
  @RequirePermission("fees.view")
  list(@CurrentUser() user: JwtPayload) {
    return this.feeCategoriesService.listCategories(user.tenant_id);
  }

  @Post()
  @RequirePermission("fees.manage_structures")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateFeeCategoryDto) {
    return this.feeCategoriesService.createCategory(user.tenant_id, user.sub, dto);
  }

  @Patch(":id")
  @RequirePermission("fees.manage_structures")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateFeeCategoryDto) {
    return this.feeCategoriesService.updateCategory(user.tenant_id, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermission("fees.manage_structures")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.feeCategoriesService.deleteCategory(user.tenant_id, user.sub, id);
  }
}
