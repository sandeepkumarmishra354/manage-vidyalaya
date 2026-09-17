import { randomUUID } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";
import type { CreateDocumentDto } from "./dto/create-document.dto.js";
import type { RequestUploadUrlDto } from "./dto/request-upload-url.dto.js";

export type DocumentOwnerType = "student" | "staff";

function sanitizeExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  const ext = fileName
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ext.slice(0, 10);
}

function toListItem(r: {
  id: string;
  label: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedByUserId: string;
  createdAt: Date;
}) {
  return {
    id: r.id,
    label: r.label,
    file_name: r.fileName,
    mime_type: r.mimeType,
    file_size: r.fileSize,
    uploaded_by_user_id: r.uploadedByUserId,
    created_at: r.createdAt,
  };
}

// Shared by both StudentsDocumentsController and StaffDocumentsController --
// the two owner types have an identical document shape and lifecycle, so
// this dispatches to the right Prisma delegate rather than duplicating the
// upload-url/create/list/delete logic per owner type.
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private async resolveOwner(tenantId: string, ownerType: DocumentOwnerType, ownerId: string) {
    const owner =
      ownerType === "student"
        ? await this.prisma.student.findFirst({ where: { id: ownerId, tenantId, deletedAt: null } })
        : await this.prisma.staff.findFirst({ where: { id: ownerId, tenantId, deletedAt: null } });
    if (!owner) {
      throw new NotFoundException(`${ownerType} not found`);
    }
    return owner;
  }

  async requestUploadUrl(tenantId: string, ownerType: DocumentOwnerType, ownerId: string, dto: RequestUploadUrlDto) {
    await this.resolveOwner(tenantId, ownerType, ownerId);
    const ext = sanitizeExtension(dto.file_name);
    const key = `doc-${randomUUID()}${ext ? `.${ext}` : ""}`;
    const upload = await this.storage.createUploadUrl(key, dto.content_type);
    return { ...upload, storage_key: key };
  }

  async create(tenantId: string, actorUserId: string, ownerType: DocumentOwnerType, ownerId: string, dto: CreateDocumentDto) {
    const owner = await this.resolveOwner(tenantId, ownerType, ownerId);
    const now = new Date();
    const id = randomUUID();

    const data = {
      id,
      tenantId,
      branchId: owner.branchId,
      label: dto.label,
      storageKey: dto.storage_key,
      fileName: dto.file_name,
      mimeType: dto.mime_type,
      fileSize: dto.file_size,
      uploadedByUserId: actorUserId,
      createdAt: now,
      updatedAt: now,
      updatedBy: actorUserId,
    };

    return this.prisma.$transaction(async (tx) => {
      const created =
        ownerType === "student"
          ? await tx.studentDocument.create({ data: { ...data, studentId: ownerId } })
          : await tx.staffDocument.create({ data: { ...data, staffId: ownerId } });

      await this.audit.record(tx, {
        tenantId,
        branchId: owner.branchId,
        actorUserId,
        entityTable: ownerType === "student" ? "student_documents" : "staff_documents",
        entityId: id,
        action: "create",
        summary: `Uploaded document '${dto.label}' (${dto.file_name})`,
      });

      return toListItem(created);
    });
  }

  async list(tenantId: string, ownerType: DocumentOwnerType, ownerId: string) {
    await this.resolveOwner(tenantId, ownerType, ownerId);
    const rows =
      ownerType === "student"
        ? await this.prisma.studentDocument.findMany({
            where: { studentId: ownerId, tenantId, deletedAt: null },
            orderBy: { createdAt: "desc" },
          })
        : await this.prisma.staffDocument.findMany({
            where: { staffId: ownerId, tenantId, deletedAt: null },
            orderBy: { createdAt: "desc" },
          });
    return rows.map(toListItem);
  }

  private async findOwned(tenantId: string, ownerType: DocumentOwnerType, ownerId: string, docId: string) {
    const row =
      ownerType === "student"
        ? await this.prisma.studentDocument.findFirst({
            where: { id: docId, studentId: ownerId, tenantId, deletedAt: null },
          })
        : await this.prisma.staffDocument.findFirst({
            where: { id: docId, staffId: ownerId, tenantId, deletedAt: null },
          });
    if (!row) {
      throw new NotFoundException("document not found");
    }
    return row;
  }

  async getDownloadUrl(tenantId: string, ownerType: DocumentOwnerType, ownerId: string, docId: string) {
    const row = await this.findOwned(tenantId, ownerType, ownerId, docId);
    return this.storage.createDownloadUrl(row.storageKey);
  }

  async remove(tenantId: string, actorUserId: string, ownerType: DocumentOwnerType, ownerId: string, docId: string) {
    const row = await this.findOwned(tenantId, ownerType, ownerId, docId);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      if (ownerType === "student") {
        await tx.studentDocument.update({
          where: { id: docId },
          data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
        });
      } else {
        await tx.staffDocument.update({
          where: { id: docId },
          data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
        });
      }

      await this.audit.record(tx, {
        tenantId,
        branchId: row.branchId,
        actorUserId,
        entityTable: ownerType === "student" ? "student_documents" : "staff_documents",
        entityId: docId,
        action: "delete",
        summary: `Deleted document '${row.label}' (${row.fileName})`,
      });
    });

    await this.storage.deleteObject(row.storageKey);

    return { ok: true };
  }
}
