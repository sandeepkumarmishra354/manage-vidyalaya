import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { LibraryBooksController, LibraryIssuesController } from "./library.controller.js";
import { LibraryService } from "./library.service.js";

@Module({
  imports: [AuditModule],
  controllers: [LibraryBooksController, LibraryIssuesController],
  providers: [LibraryService],
})
export class LibraryModule {}
