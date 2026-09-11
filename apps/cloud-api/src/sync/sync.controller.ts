import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { SyncPullQueryDto } from "./dto/sync-pull.dto.js";
import { SyncPushDto } from "./dto/sync-push.dto.js";
import { SyncService } from "./sync.service.js";

@Controller("sync")
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post("push")
  async push(@CurrentUser() user: JwtPayload, @Body() dto: SyncPushDto) {
    const results = await this.syncService.push(user.tenant_id, dto.tenant_id, dto.changes);
    return { results };
  }

  @Get("pull")
  pull(@CurrentUser() user: JwtPayload, @Query() query: SyncPullQueryDto) {
    return this.syncService.pull(
      user.tenant_id,
      query.tenant_id,
      query.since_server_seq,
      query.limit,
    );
  }
}
