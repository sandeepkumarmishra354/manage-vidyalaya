import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { PromotionController } from "./promotion.controller.js";
import { PromotionService } from "./promotion.service.js";

@Module({
  imports: [AuditModule],
  controllers: [PromotionController],
  providers: [PromotionService],
})
export class PromotionModule {}
