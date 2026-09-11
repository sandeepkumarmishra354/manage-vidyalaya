import { ForbiddenException, Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import type { SyncChangeDto } from "./dto/sync-push.dto.js";

export interface SyncPushResult {
  entity_table: string;
  entity_id: string;
  server_seq: number;
  accepted: boolean;
}

export interface SyncPullResponse {
  changes: {
    entity_table: string;
    entity_id: string;
    op: string;
    payload: Record<string, unknown>;
    server_seq: number;
  }[];
  latest_server_seq: number;
  has_more: boolean;
}

const DEFAULT_PULL_LIMIT = 200;

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records each pushed change as an event in the append-only sync_log.
   * Conflict resolution is last-write-wins: whichever change reaches this
   * endpoint last "wins" the entity's state on the next pull, using the
   * version field embedded in the payload for callers that want to detect
   * staleness client-side. See plan doc: documented v1 limitation, upgrade
   * path is per-field merge or CRDTs if concurrent same-record edits become
   * common.
   */
  async push(
    callerTenantId: string,
    tenantId: string,
    changes: SyncChangeDto[],
  ): Promise<SyncPushResult[]> {
    if (callerTenantId !== tenantId) {
      throw new ForbiddenException("Cannot push changes for another tenant");
    }

    const results: SyncPushResult[] = [];

    for (const change of changes) {
      const row = await this.prisma.syncLog.create({
        data: {
          tenantId,
          entityTable: change.entity_table,
          entityId: change.entity_id,
          op: change.op,
          payload: change.payload as object,
        },
      });

      results.push({
        entity_table: change.entity_table,
        entity_id: change.entity_id,
        server_seq: Number(row.serverSeq),
        accepted: true,
      });
    }

    return results;
  }

  async pull(
    callerTenantId: string,
    tenantId: string,
    sinceServerSeq: number,
    limit = DEFAULT_PULL_LIMIT,
  ): Promise<SyncPullResponse> {
    if (callerTenantId !== tenantId) {
      throw new ForbiddenException("Cannot pull changes for another tenant");
    }

    const rows = await this.prisma.syncLog.findMany({
      where: { tenantId, serverSeq: { gt: BigInt(sinceServerSeq) } },
      orderBy: { serverSeq: "asc" },
      take: limit,
    });

    const latest = rows.length > 0 ? Number(rows[rows.length - 1].serverSeq) : sinceServerSeq;

    return {
      changes: rows.map((row) => ({
        entity_table: row.entityTable,
        entity_id: row.entityId,
        op: row.op,
        payload: row.payload as Record<string, unknown>,
        server_seq: Number(row.serverSeq),
      })),
      latest_server_seq: latest,
      has_more: rows.length === limit,
    };
  }
}
