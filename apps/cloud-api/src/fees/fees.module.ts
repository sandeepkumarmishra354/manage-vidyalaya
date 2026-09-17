import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import {
  FeeInvoicesController,
  FeePaymentsController,
  FeeStructuresController,
  StudentFeeAssignmentsController,
  StudentFeeAssignmentsQueryController,
} from "./fees.controller.js";
import { FeesService } from "./fees.service.js";

@Module({
  imports: [AuditModule],
  controllers: [
    FeeStructuresController,
    FeeInvoicesController,
    FeePaymentsController,
    StudentFeeAssignmentsController,
    StudentFeeAssignmentsQueryController,
  ],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
