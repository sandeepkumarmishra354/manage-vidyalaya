import { Body, Controller, Get, Post, Req, UseGuards, type ExecutionContext } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";

import { CurrentUser } from "../common/current-user.decorator.js";
import { deriveSubdomainFromRequest } from "../common/subdomain.js";
import { AuthService } from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { RefreshDto } from "./dto/refresh.dto.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import type { JwtPayload } from "./jwt.strategy.js";
import { buildLoginThrottleKey } from "./login-throttle-key.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @Throttle({
    default: {
      limit: 10,
      ttl: 60_000,
      generateKey: (context: ExecutionContext, trackerString: string) =>
        buildLoginThrottleKey(trackerString, context.switchToHttp().getRequest<Request>().body),
    },
  })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto.email, dto.password, deriveSubdomainFromRequest(req));
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.tenant_id, user.sub);
  }
}
