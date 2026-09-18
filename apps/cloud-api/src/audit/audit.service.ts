import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { PoolClient } from "pg";

import type { PrismaService } from "../prisma/prisma.service.js";

// Transitional types while the codebase migrates off Prisma module by
// module (see the migration plan). `PrismaAuditableClient` is what a
// not-yet-converted service still uses for its own Prisma calls (not just
// audit.record); `AuditableClient` -- what audit.record itself accepts --
// is the union of that with the raw-pg PoolClient a converted service
// passes instead. Once every module is converted, both collapse down to
// just PoolClient and the Prisma branch below is deleted.
export type PrismaAuditableClient = PrismaService | Prisma.TransactionClient;
export type AuditableClient = PoolClient | PrismaAuditableClient;

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

function isPoolClient(client: AuditableClient): client is PoolClient {
  return typeof (client as PoolClient).query === "function" && !("auditLog" in client);
}

/// Writes one row to the append-only `audit_log` table. Every mutating
/// service method calls this from inside its own transaction (a raw-pg
/// `DbService.withTransaction`, or -- for not-yet-converted modules -- a
/// Prisma `$transaction`), so the audit row and the mutation it describes
/// commit atomically.
@Injectable()
export class AuditService {
  async record(client: AuditableClient, entry: AuditEntry): Promise<void> {
    if (isPoolClient(client)) {
      await client.query(
        `INSERT INTO audit_log
           (id, tenant_id, branch_id, actor_user_id, entity_table, entity_id, action, summary, before_json, after_json, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          randomUUID(),
          entry.tenantId,
          entry.branchId ?? null,
          entry.actorUserId ?? null,
          entry.entityTable,
          entry.entityId,
          entry.action,
          entry.summary,
          entry.before === undefined ? null : JSON.stringify(entry.before),
          entry.after === undefined ? null : JSON.stringify(entry.after),
          new Date(),
        ],
      );
      return;
    }

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
