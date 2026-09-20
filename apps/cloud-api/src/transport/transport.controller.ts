import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { AssignTransportDto } from "./dto/assign-transport.dto.js";
import { CreateRouteDto } from "./dto/create-route.dto.js";
import { CreateStopDto } from "./dto/create-stop.dto.js";
import { UpdateRouteDto } from "./dto/update-route.dto.js";
import { UpdateStopDto } from "./dto/update-stop.dto.js";
import { TransportService } from "./transport.service.js";

@Controller("transport/routes")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class TransportRoutesController {
  constructor(private readonly transportService: TransportService) {}

  @Get()
  @RequirePermission("transport.view")
  list(@CurrentUser() user: JwtPayload, @Query("branch_id") branchId: string) {
    return this.transportService.listRoutes(user.tenant_id, branchId);
  }

  @Post()
  @RequirePermission("transport.manage_routes")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRouteDto) {
    return this.transportService.createRoute(user.tenant_id, dto);
  }

  @Patch(":id")
  @RequirePermission("transport.manage_routes")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateRouteDto) {
    return this.transportService.updateRoute(user.tenant_id, user.sub, id, dto);
  }

  @Get(":routeId/roster")
  @RequirePermission("transport.view")
  roster(@CurrentUser() user: JwtPayload, @Param("routeId") routeId: string) {
    return this.transportService.listRouteRoster(user.tenant_id, routeId);
  }
}

@Controller("transport/stops")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class TransportStopsController {
  constructor(private readonly transportService: TransportService) {}

  @Get()
  @RequirePermission("transport.view")
  list(@CurrentUser() user: JwtPayload, @Query("route_id") routeId: string) {
    return this.transportService.listStops(user.tenant_id, routeId);
  }

  @Post()
  @RequirePermission("transport.manage_routes")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateStopDto) {
    return this.transportService.createStop(user.tenant_id, dto);
  }

  @Patch(":id")
  @RequirePermission("transport.manage_routes")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateStopDto) {
    return this.transportService.updateStop(user.tenant_id, user.sub, id, dto);
  }
}

@Controller("transport/assignments")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class TransportAssignmentsController {
  constructor(private readonly transportService: TransportService) {}

  @Post()
  @RequirePermission("transport.manage_assignments")
  assign(@CurrentUser() user: JwtPayload, @Body() dto: AssignTransportDto) {
    return this.transportService.assignStudentTransport(user.tenant_id, user.sub, dto);
  }

  @Get("student/:studentId")
  @RequirePermission("transport.view")
  studentTransport(@CurrentUser() user: JwtPayload, @Param("studentId") studentId: string) {
    return this.transportService.getStudentTransport(user.tenant_id, studentId);
  }
}
