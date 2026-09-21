import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PERMISSION_CATALOG, PERMISSION_LABELS } from "../common/permission-catalog.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RolesService } from "./roles.service.js";

// Roles are read-only: every tenant is limited to the fixed catalog of 5
// system role names, each with its canonical, server-defined permission set
// (see permission-catalog.ts's SYSTEM_ROLE_PERMISSIONS, seeded by
// scripts/create-tenant.ts/seed.ts). Custom role creation/editing has been
// removed entirely -- both so headcount limits (see plan-catalog.ts) can be
// enforced by counting roles.name directly, and so the fixed permission
// sets can't drift from what's documented/supported.
@Controller("roles")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.rolesService.listRoles(user.tenant_id);
  }

  @Get(":id/permissions")
  listPermissions(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.rolesService.listRolePermissions(user.tenant_id, id);
  }
}

@Controller("permissions")
@UseGuards(JwtAuthGuard)
export class PermissionsCatalogController {
  @Get("catalog")
  catalog() {
    return PERMISSION_CATALOG.map((key) => ({ key, ...PERMISSION_LABELS[key] }));
  }
}
