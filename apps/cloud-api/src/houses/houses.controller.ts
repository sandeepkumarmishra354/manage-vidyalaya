import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { ModuleAccessGuard } from "../common/module-access.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequireModule } from "../common/require-module.decorator.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { AssignHouseDto } from "./dto/assign-house.dto.js";
import { AwardPointsDto } from "./dto/award-points.dto.js";
import { CreateHouseDto } from "./dto/create-house.dto.js";
import { UpdateHouseDto } from "./dto/update-house.dto.js";
import { HousesService } from "./houses.service.js";

@Controller("houses")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard, ModuleAccessGuard)
@RequireModule("houses")
export class HousesController {
  constructor(private readonly housesService: HousesService) {}

  @Get()
  @RequirePermission("houses.view")
  list(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string) {
    return this.housesService.listHouses(user.tenant_id, branchId);
  }

  @Post()
  @RequirePermission("houses.manage_teams")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateHouseDto) {
    return this.housesService.createHouse(user.tenant_id, dto);
  }

  @Patch(":id")
  @RequirePermission("houses.manage_teams")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateHouseDto) {
    return this.housesService.updateHouse(user.tenant_id, user.sub, id, dto, user.branch_id);
  }

  @Get("leaderboard")
  leaderboard(
    @CurrentUser() user: JwtPayload,
    @Query("branch_id") branchId: string,
    @Query("academic_session_id") academicSessionId?: string,
  ) {
    return this.housesService.getHouseLeaderboard(user.tenant_id, branchId, academicSessionId);
  }

  @Get("points-events")
  pointsEvents(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string) {
    return this.housesService.listHousePointEvents(user.tenant_id, branchId);
  }

  @Post("points-events")
  @RequirePermission("houses.manage_points")
  awardPoints(@CurrentUser() user: JwtPayload, @Body() dto: AwardPointsDto) {
    return this.housesService.awardHousePoints(user.tenant_id, dto);
  }

  @Post("assign-student")
  @RequirePermission("houses.manage_teams")
  assign(@CurrentUser() user: JwtPayload, @Body() dto: AssignHouseDto) {
    return this.housesService.assignStudentHouse(user.tenant_id, user.sub, dto);
  }

  @Get("student/:studentId")
  studentHouse(@CurrentUser() user: JwtPayload, @Param("studentId") studentId: string) {
    return this.housesService.getStudentHouse(user.tenant_id, studentId, user.branch_id);
  }
}
