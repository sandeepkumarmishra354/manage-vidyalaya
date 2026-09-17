import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { LibraryBooksController, LibraryIssuesController, LibraryStatsController } from "./library.controller.js";
import { LibraryService } from "./library.service.js";

@Module({
  imports: [AuditModule],
  controllers: [LibraryBooksController, LibraryIssuesController, LibraryStatsController],
  providers: [LibraryService],
})
export class LibraryModule {}
