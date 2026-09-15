import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { FeeCategoriesController } from "./fee-categories.controller.js";
import { FeeCategoriesService } from "./fee-categories.service.js";

@Module({
  imports: [AuditModule],
  controllers: [FeeCategoriesController],
  providers: [FeeCategoriesService],
})
export class FeeCategoriesModule {}
