import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CreateStaffCategoryDto } from "./dto/create-staff-category.dto.js";
import { UpdateStaffCategoryDto } from "./dto/update-staff-category.dto.js";
import { StaffCategoriesService } from "./staff-categories.service.js";

@Controller("staff-categories")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffCategoriesController {
  constructor(private readonly staffCategoriesService: StaffCategoriesService) {}

  @Get()
  @RequirePermission("staff.view")
  list(@CurrentUser() user: JwtPayload) {
    return this.staffCategoriesService.listCategories(user.tenant_id);
  }

  @Post()
  @RequirePermission("staff.manage_profile")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateStaffCategoryDto) {
    return this.staffCategoriesService.createCategory(user.tenant_id, user.sub, dto);
  }

  @Patch(":id")
  @RequirePermission("staff.manage_profile")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateStaffCategoryDto) {
    return this.staffCategoriesService.updateCategory(user.tenant_id, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermission("staff.manage_profile")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.staffCategoriesService.deleteCategory(user.tenant_id, user.sub, id);
  }
}
