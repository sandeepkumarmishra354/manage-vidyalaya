import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CreatePromotionBatchDto } from "./dto/create-promotion-batch.dto.js";
import { SetPromotionDecisionDto } from "./dto/set-promotion-decision.dto.js";
import { PromotionService } from "./promotion.service.js";

@Controller("promotion")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  @Get("suggest-class-mapping")
  @RequirePermission("academic_setup.promote")
  suggestClassMapping(
    @Query("branch_id") branchId: string,
    @Query("from_session_id") fromSessionId: string,
    @Query("to_session_id") toSessionId: string,
  ) {
    return this.promotionService.suggestClassMapping(branchId, fromSessionId, toSessionId);
  }

  @Post("batches")
  @RequirePermission("academic_setup.promote")
  createBatch(@CurrentUser() user: JwtPayload, @Body() dto: CreatePromotionBatchDto) {
    return this.promotionService.createPromotionBatch(user.tenant_id, user.sub, dto);
  }

  @Get("batches/:id")
  @RequirePermission("academic_setup.promote")
  getBatch(@Param("id") id: string) {
    return this.promotionService.getPromotionBatch(id);
  }

  @Patch("batch-items/:id")
  @RequirePermission("academic_setup.promote")
  setDecision(@Param("id") id: string, @Body() dto: SetPromotionDecisionDto) {
    return this.promotionService.setPromotionDecision(id, dto);
  }

  @Post("batches/:id/execute")
  @RequirePermission("academic_setup.promote")
  execute(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.promotionService.executePromotionBatch(user.tenant_id, user.sub, id);
  }
}
