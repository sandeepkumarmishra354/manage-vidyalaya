import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { ApplyStaffLeaveDto } from "./dto/apply-staff-leave.dto.js";
import { DecideStaffLeaveDto } from "./dto/decide-staff-leave.dto.js";
import { FileStaffLeaveDto } from "./dto/file-staff-leave.dto.js";
import { StaffLeaveService } from "./staff-leave.service.js";

@Controller("staff-leave")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffLeaveController {
  constructor(private readonly staffLeaveService: StaffLeaveService) {}

  // Self-service: ownership-checked in the service (does this login have a
  // linked Staff row), not permission-gated -- any authenticated user can
  // apply for/view/cancel their own leave.
  @Post("apply")
  apply(@CurrentUser() user: JwtPayload, @Body() dto: ApplyStaffLeaveDto) {
    return this.staffLeaveService.apply(user.tenant_id, user.sub, dto);
  }

  @Get("mine")
  mine(@CurrentUser() user: JwtPayload) {
    return this.staffLeaveService.listMine(user.tenant_id, user.sub);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.staffLeaveService.cancel(user.tenant_id, user.sub, id);
  }

  // HR/admin side.
  @Post()
  @RequirePermission("staff_leave.manage")
  file(@CurrentUser() user: JwtPayload, @Body() dto: FileStaffLeaveDto) {
    return this.staffLeaveService.file(user.tenant_id, user.sub, dto);
  }

  @Get()
  @RequirePermission("staff_leave.manage")
  list(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string, @Query("status") status?: string) {
    return this.staffLeaveService.listForBranch(user.tenant_id, branchId, status);
  }

  @Post(":id/decide")
  @RequirePermission("staff_leave.manage")
  decide(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: DecideStaffLeaveDto) {
    return this.staffLeaveService.decide(user.tenant_id, user.sub, id, dto);
  }
}
