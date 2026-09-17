import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { CreateDocumentDto } from "./dto/create-document.dto.js";
import { RequestUploadUrlDto } from "./dto/request-upload-url.dto.js";
import { DocumentsService } from "./documents.service.js";

@Controller("students/:id/documents")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StudentDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermission("students.view")
  list(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.documents.list(user.tenant_id, "student", id);
  }

  @Post("upload-url")
  @RequirePermission("students.edit")
  requestUploadUrl(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: RequestUploadUrlDto) {
    return this.documents.requestUploadUrl(user.tenant_id, "student", id, dto);
  }

  @Post()
  @RequirePermission("students.edit")
  create(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: CreateDocumentDto) {
    return this.documents.create(user.tenant_id, user.sub, "student", id, dto);
  }

  @Get(":docId/download-url")
  @RequirePermission("students.view")
  downloadUrl(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("docId") docId: string) {
    return this.documents.getDownloadUrl(user.tenant_id, "student", id, docId);
  }

  @Delete(":docId")
  @RequirePermission("students.edit")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("docId") docId: string) {
    return this.documents.remove(user.tenant_id, user.sub, "student", id, docId);
  }
}

@Controller("staff/:id/documents")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermission("staff.view")
  list(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.documents.list(user.tenant_id, "staff", id);
  }

  @Post("upload-url")
  @RequirePermission("staff.manage_profile")
  requestUploadUrl(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: RequestUploadUrlDto) {
    return this.documents.requestUploadUrl(user.tenant_id, "staff", id, dto);
  }

  @Post()
  @RequirePermission("staff.manage_profile")
  create(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: CreateDocumentDto) {
    return this.documents.create(user.tenant_id, user.sub, "staff", id, dto);
  }

  @Get(":docId/download-url")
  @RequirePermission("staff.view")
  downloadUrl(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("docId") docId: string) {
    return this.documents.getDownloadUrl(user.tenant_id, "staff", id, docId);
  }

  @Delete(":docId")
  @RequirePermission("staff.manage_profile")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("docId") docId: string) {
    return this.documents.remove(user.tenant_id, user.sub, "staff", id, docId);
  }
}
