import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { ExpensesController } from "./expenses.controller.js";
import { ExpensesService } from "./expenses.service.js";

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
