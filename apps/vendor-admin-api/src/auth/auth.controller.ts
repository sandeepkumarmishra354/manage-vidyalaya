import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

import { AuthService } from "./auth.service.js";
import { CurrentVendorAdmin } from "./current-vendor-admin.decorator.js";
import { LoginDto } from "./dto/login.dto.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import type { VendorAdminJwtPayload } from "./jwt.strategy.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentVendorAdmin() admin: VendorAdminJwtPayload) {
    return admin;
  }
}
