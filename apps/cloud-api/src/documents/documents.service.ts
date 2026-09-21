import { randomUUID } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import { StorageService } from "../storage/storage.service.js";
import type { CreateDocumentDto } from "./dto/create-document.dto.js";
import type { RequestUploadUrlDto } from "./dto/request-upload-url.dto.js";

export type DocumentOwnerType = "student" | "staff";

interface DocumentRow extends TenantRow {
  branch_id: string;
  label: string;
  storage_key: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by_user_id: string;
  created_at: Date;
}

function sanitizeExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  const ext = fileName
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ext.slice(0, 10);
}

function toListItem(r: DocumentRow) {
  return {
    id: r.id,
    label: r.label,
    file_name: r.file_name,
    mime_type: r.mime_type,
    file_size: r.file_size,
    uploaded_by_user_id: r.uploaded_by_user_id,
    created_at: r.created_at,
  };
}

function ownerTable(ownerType: DocumentOwnerType): "student_documents" | "staff_documents" {
  return ownerType === "student" ? "student_documents" : "staff_documents";
}

function ownerColumn(ownerType: DocumentOwnerType): "student_id" | "staff_id" {
  return ownerType === "student" ? "student_id" : "staff_id";
}

// Shared by both StudentsDocumentsController and StaffDocumentsController --
// the two owner types have an identical document shape and lifecycle, so
// this dispatches to the right table rather than duplicating the
// upload-url/create/list/delete logic per owner type.
@Injectable()
export class DocumentsService {
  constructor(
    private readonly db: DbService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private async resolveOwner(
    tenantId: string,
    ownerType: DocumentOwnerType,
    ownerId: string,
    branchId: string | null,
  ) {
    const table = ownerType === "student" ? "students" : "staff";
    const conditions = ["id = $1", "tenant_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [ownerId, tenantId];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    const owner = await this.db.queryOne<{ id: string; branch_id: string }>(
      tenantId,
      `SELECT id, branch_id FROM ${table} WHERE ${conditions.join(" AND ")}`,
      values,
    );
    if (!owner) {
      throw new NotFoundException(`${ownerType} not found`);
    }
    return owner;
  }

  async requestUploadUrl(
    tenantId: string,
    ownerType: DocumentOwnerType,
    ownerId: string,
    dto: RequestUploadUrlDto,
    branchId: string | null,
  ) {
    await this.resolveOwner(tenantId, ownerType, ownerId, branchId);
    const ext = sanitizeExtension(dto.file_name);
    const key = `doc-${randomUUID()}${ext ? `.${ext}` : ""}`;
    const upload = await this.storage.createUploadUrl(key, dto.content_type);
    return { ...upload, storage_key: key };
  }

  async create(
    tenantId: string,
    actorUserId: string,
    ownerType: DocumentOwnerType,
    ownerId: string,
    dto: CreateDocumentDto,
    branchId: string | null,
  ) {
    const owner = await this.resolveOwner(tenantId, ownerType, ownerId, branchId);

    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      const created = await insertRow<DocumentRow>(client, ownerTable(ownerType), tenantId, {
        [ownerColumn(ownerType)]: ownerId,
        branch_id: owner.branch_id,
        label: dto.label,
        storage_key: dto.storage_key,
        file_name: dto.file_name,
        mime_type: dto.mime_type,
        file_size: dto.file_size,
        uploaded_by_user_id: actorUserId,
        created_at: now,
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: owner.branch_id,
        actorUserId,
        entityTable: ownerTable(ownerType),
        entityId: created.id,
        action: "create",
        summary: `Uploaded document '${dto.label}' (${dto.file_name})`,
      });

      return toListItem(created);
    });
  }

  async list(tenantId: string, ownerType: DocumentOwnerType, ownerId: string, branchId: string | null) {
    await this.resolveOwner(tenantId, ownerType, ownerId, branchId);
    const rows = await this.db.query<DocumentRow>(
      tenantId,
      `SELECT * FROM ${ownerTable(ownerType)} WHERE ${ownerColumn(ownerType)} = $1 AND tenant_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [ownerId, tenantId],
    );
    return rows.map(toListItem);
  }

  // student_documents/staff_documents carry their own branch_id (unlike the
  // guardians/student_elective_choices "no branch_id" cases elsewhere), so
  // it's filtered directly here rather than only via the parent owner.
  private async findOwned(
    tenantId: string,
    ownerType: DocumentOwnerType,
    ownerId: string,
    docId: string,
    branchId: string | null,
  ) {
    const conditions = [
      "id = $1",
      `${ownerColumn(ownerType)} = $2`,
      "tenant_id = $3",
      "deleted_at IS NULL",
    ];
    const values: unknown[] = [docId, ownerId, tenantId];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    const row = await this.db.queryOne<DocumentRow>(
      tenantId,
      `SELECT * FROM ${ownerTable(ownerType)} WHERE ${conditions.join(" AND ")}`,
      values,
    );
    if (!row) {
      throw new NotFoundException("document not found");
    }
    return row;
  }

  async getDownloadUrl(
    tenantId: string,
    ownerType: DocumentOwnerType,
    ownerId: string,
    docId: string,
    branchId: string | null,
  ) {
    const row = await this.findOwned(tenantId, ownerType, ownerId, docId, branchId);
    return this.storage.createDownloadUrl(row.storage_key);
  }

  async remove(
    tenantId: string,
    actorUserId: string,
    ownerType: DocumentOwnerType,
    ownerId: string,
    docId: string,
    branchId: string | null,
  ) {
    const row = await this.findOwned(tenantId, ownerType, ownerId, docId, branchId);

    await this.db.withTransaction(tenantId, async (client) => {
      await updateRow<DocumentRow>(
        client,
        ownerTable(ownerType),
        tenantId,
        docId,
        {
          deleted_at: new Date(),
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        branchId: row.branch_id,
        actorUserId,
        entityTable: ownerTable(ownerType),
        entityId: docId,
        action: "delete",
        summary: `Deleted document '${row.label}' (${row.file_name})`,
      });
    });

    await this.storage.deleteObject(row.storage_key);

    return { ok: true };
  }
}
