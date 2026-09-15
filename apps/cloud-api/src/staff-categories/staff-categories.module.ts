import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { StaffCategoriesController } from "./staff-categories.controller.js";
import { StaffCategoriesService } from "./staff-categories.service.js";

@Module({
  imports: [AuditModule],
  controllers: [StaffCategoriesController],
  providers: [StaffCategoriesService],
})
export class StaffCategoriesModule {}
