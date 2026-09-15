import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { PayrollRunsController, PayslipsController, SalaryStructuresController } from "./payroll.controller.js";
import { PayrollService } from "./payroll.service.js";

@Module({
  imports: [AuditModule],
  controllers: [SalaryStructuresController, PayrollRunsController, PayslipsController],
  providers: [PayrollService],
})
export class PayrollModule {}
