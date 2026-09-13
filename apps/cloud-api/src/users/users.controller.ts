import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { ResetPasswordDto } from "./dto/reset-password.dto.js";
import { UsersService } from "./users.service.js";

@Controller("users")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermission("users.manage")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(user.tenant_id, dto);
  }

  @Post(":id/reset-password")
  @RequirePermission("users.manage")
  async resetPassword(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    await this.usersService.resetPassword(user.tenant_id, id, dto.password);
    return { ok: true };
  }
}
