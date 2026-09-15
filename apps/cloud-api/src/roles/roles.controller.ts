import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PERMISSION_CATALOG } from "../common/permission-catalog.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CreateRoleDto } from "./dto/create-role.dto.js";
import { SetRolePermissionsDto } from "./dto/set-role-permissions.dto.js";
import { UpdateRoleDto } from "./dto/update-role.dto.js";
import { RolesService } from "./roles.service.js";

@Controller("roles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.rolesService.listRoles(user.tenant_id);
  }

  @Post()
  @RequirePermission("roles.manage")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(user.tenant_id, user.sub, dto);
  }

  @Patch(":id")
  @RequirePermission("roles.manage")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.updateRole(user.tenant_id, user.sub, id, dto);
  }

  @Delete(":id")
  @RequirePermission("roles.manage")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.rolesService.deleteRole(user.tenant_id, user.sub, id);
  }

  @Get(":id/permissions")
  listPermissions(@Param("id") id: string) {
    return this.rolesService.listRolePermissions(id);
  }

  @Put(":id/permissions")
  @RequirePermission("roles.manage")
  setPermissions(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: SetRolePermissionsDto) {
    return this.rolesService.setRolePermissions(user.tenant_id, user.sub, id, dto);
  }
}

@Controller("permissions")
@UseGuards(JwtAuthGuard)
export class PermissionsCatalogController {
  @Get("catalog")
  catalog() {
    return PERMISSION_CATALOG;
  }
}
