import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { FeesModule } from "../fees/fees.module.js";
import { StudentsModule } from "../students/students.module.js";
import { FeeDiscountsController, StudentFeeDiscountsQueryController } from "./fee-discounts.controller.js";
import { FeeDiscountsService } from "./fee-discounts.service.js";

@Module({
  imports: [AuditModule, FeesModule, StudentsModule],
  controllers: [FeeDiscountsController, StudentFeeDiscountsQueryController],
  providers: [FeeDiscountsService],
})
export class FeeDiscountsModule {}
