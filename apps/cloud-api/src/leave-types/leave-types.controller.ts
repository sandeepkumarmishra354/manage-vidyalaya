import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CreateLeaveTypeDto } from "./dto/create-leave-type.dto.js";
import { SetLeaveTypeQuotasDto } from "./dto/set-leave-type-quotas.dto.js";
import { UpdateLeaveTypeDto } from "./dto/update-leave-type.dto.js";
import { LeaveTypesService } from "./leave-types.service.js";

@Controller("leave-types")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class LeaveTypesController {
  constructor(private readonly leaveTypesService: LeaveTypesService) {}

  // Read-only -- any authenticated user can list them (populates the Apply
  // Leave dropdown), only mutations are permission-gated.
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.leaveTypesService.listTypes(user.tenant_id);
  }

  @Post()
  @RequirePermission("master_data.manage_leave_type")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateLeaveTypeDto) {
    return this.leaveTypesService.createType(user.tenant_id, user.sub, dto);
  }

  @Patch(":id")
  @RequirePermission("master_data.manage_leave_type")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.leaveTypesService.updateType(user.tenant_id, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermission("master_data.manage_leave_type")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.leaveTypesService.deleteType(user.tenant_id, user.sub, id);
  }

  @Get(":id/quotas")
  @RequirePermission("master_data.manage_leave_type")
  listQuotas(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.leaveTypesService.listQuotas(user.tenant_id, id);
  }

  @Put(":id/quotas")
  @RequirePermission("master_data.manage_leave_type")
  setQuotas(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: SetLeaveTypeQuotasDto) {
    return this.leaveTypesService.setQuotas(user.tenant_id, user.sub, id, dto);
  }
}
