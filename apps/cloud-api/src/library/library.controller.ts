import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CreateBookDto } from "./dto/create-book.dto.js";
import { IssueBookDto } from "./dto/issue-book.dto.js";
import { UpdateBookDto } from "./dto/update-book.dto.js";
import { LibraryService } from "./library.service.js";

@Controller("library/books")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LibraryBooksController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get()
  @RequirePermission("library.view")
  list(@Query("branch_id") branchId: string, @Query("search") search?: string) {
    return this.libraryService.listBooks(branchId, search);
  }

  @Post()
  @RequirePermission("library.manage_catalog")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBookDto) {
    return this.libraryService.createBook(user.tenant_id, dto);
  }

  @Patch(":id")
  @RequirePermission("library.manage_catalog")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateBookDto) {
    return this.libraryService.updateBook(user.tenant_id, user.sub, id, dto);
  }
}

@Controller("library/issues")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LibraryIssuesController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get()
  @RequirePermission("library.view")
  list(@Query("branch_id") branchId: string, @Query("status") status?: string) {
    return this.libraryService.listIssues(branchId, status);
  }

  @Post()
  @RequirePermission("library.manage_issues")
  issue(@CurrentUser() user: JwtPayload, @Body() dto: IssueBookDto) {
    return this.libraryService.issueBook(user.tenant_id, user.sub, dto);
  }

  @Post(":id/return")
  @RequirePermission("library.manage_issues")
  return_(@Param("id") id: string) {
    return this.libraryService.returnBook(id);
  }
}
