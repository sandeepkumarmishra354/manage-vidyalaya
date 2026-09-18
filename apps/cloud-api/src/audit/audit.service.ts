import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

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
/// service method calls this from inside its own `DbService.withTransaction`,
/// so the audit row and the mutation it describes commit atomically.
@Injectable()
export class AuditService {
  async record(client: PoolClient, entry: AuditEntry): Promise<void> {
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
  }
}
