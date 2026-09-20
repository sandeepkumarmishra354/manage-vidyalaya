import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { BranchScopeGuard } from "../common/branch-scope.guard.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { AssignRoleDto } from "./dto/assign-role.dto.js";
import { CreateStaffLoginDto } from "./dto/create-staff-login.dto.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { ResetPasswordDto } from "./dto/reset-password.dto.js";
import { SetUserActiveDto } from "./dto/set-user-active.dto.js";
import { UsersService } from "./users.service.js";

@Controller("users")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("search") search?: string, @Query("role_id") roleId?: string) {
    return this.usersService.listUsers(user.tenant_id, search, roleId);
  }

  @Post()
  @RequirePermission("users.manage")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(user.tenant_id, dto);
  }

  @Post("staff-login")
  @RequirePermission("users.manage")
  createStaffLogin(@CurrentUser() user: JwtPayload, @Body() dto: CreateStaffLoginDto) {
    return this.usersService.createStaffLogin(user.tenant_id, user.sub, dto);
  }

  @Post(":id/reset-password")
  @RequirePermission("users.manage")
  // Already gated by auth + users.manage, but a compromised/malicious
  // admin session shouldn't be able to mass-reset passwords rapidly --
  // defense-in-depth on top of the flat permission check.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resetPassword(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: ResetPasswordDto) {
    await this.usersService.resetPassword(user.tenant_id, user.sub, id, dto.password, user.branch_id);
    return { ok: true };
  }

  @Post(":id/roles")
  @RequirePermission("users.manage")
  async assignRole(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: AssignRoleDto) {
    await this.usersService.assignUserRole(user.tenant_id, user.sub, id, dto.role_id, user.branch_id);
    return { ok: true };
  }

  @Delete(":id/roles/:roleId")
  @RequirePermission("users.manage")
  async removeRole(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("roleId") roleId: string) {
    await this.usersService.removeUserRole(user.tenant_id, user.sub, id, roleId, user.branch_id);
    return { ok: true };
  }

  @Post(":id/active")
  @RequirePermission("users.manage")
  setActive(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: SetUserActiveDto) {
    return this.usersService.setUserActive(user.tenant_id, user.sub, id, dto.is_active, user.branch_id);
  }
}
