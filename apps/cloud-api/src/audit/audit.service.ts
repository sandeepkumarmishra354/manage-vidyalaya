import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service.js";

export type AuditableClient = PrismaService | Prisma.TransactionClient;

export interface AuditEntry {
  tenantId: string;
  branchId?: string | null;
  actorUserId?: string | null;
  entityTable: string;
  entityId: string;
  action: "create" | "update" | "delete" | "login" | "logout";
  summary: string;
  before?: unknown;
  after?: unknown;
}

/// Writes one row to the append-only `audit_log` table. Every mutating
/// service method calls this -- ideally via `prisma.$transaction`, so the
/// audit row and the mutation it describes commit atomically, mirroring the
/// old Rust `audit::record_audit` (which ran inside the same SQLite
/// transaction as the write it recorded).
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(client: AuditableClient, entry: AuditEntry): Promise<void> {
    await client.auditLog.create({
      data: {
        id: randomUUID(),
        tenantId: entry.tenantId,
        branchId: entry.branchId ?? null,
        actorUserId: entry.actorUserId ?? null,
        entityTable: entry.entityTable,
        entityId: entry.entityId,
        action: entry.action,
        summary: entry.summary,
        beforeJson: entry.before as Prisma.InputJsonValue | undefined,
        afterJson: entry.after as Prisma.InputJsonValue | undefined,
        createdAt: new Date(),
      },
    });
  }
}
