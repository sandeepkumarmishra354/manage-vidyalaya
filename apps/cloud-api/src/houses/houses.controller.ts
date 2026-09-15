import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { AssignHouseDto } from "./dto/assign-house.dto.js";
import { AwardPointsDto } from "./dto/award-points.dto.js";
import { CreateHouseDto } from "./dto/create-house.dto.js";
import { UpdateHouseDto } from "./dto/update-house.dto.js";
import { HousesService } from "./houses.service.js";

@Controller("houses")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HousesController {
  constructor(private readonly housesService: HousesService) {}

  @Get()
  @RequirePermission("houses.view")
  list(@Query("branch_id") branchId: string) {
    return this.housesService.listHouses(branchId);
  }

  @Post()
  @RequirePermission("houses.manage")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateHouseDto) {
    return this.housesService.createHouse(user.tenant_id, dto);
  }

  @Patch(":id")
  @RequirePermission("houses.manage")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateHouseDto) {
    return this.housesService.updateHouse(user.tenant_id, user.sub, id, dto);
  }

  @Get("leaderboard")
  leaderboard(@Query("branch_id") branchId: string, @Query("academic_session_id") academicSessionId?: string) {
    return this.housesService.getHouseLeaderboard(branchId, academicSessionId);
  }

  @Get("points-events")
  pointsEvents(@Query("branch_id") branchId: string) {
    return this.housesService.listHousePointEvents(branchId);
  }

  @Post("points-events")
  @RequirePermission("houses.manage")
  awardPoints(@CurrentUser() user: JwtPayload, @Body() dto: AwardPointsDto) {
    return this.housesService.awardHousePoints(user.tenant_id, dto);
  }

  @Post("assign-student")
  @RequirePermission("houses.manage")
  assign(@CurrentUser() user: JwtPayload, @Body() dto: AssignHouseDto) {
    return this.housesService.assignStudentHouse(user.tenant_id, user.sub, dto);
  }

  @Get("student/:studentId")
  studentHouse(@Param("studentId") studentId: string) {
    return this.housesService.getStudentHouse(studentId);
  }
}
