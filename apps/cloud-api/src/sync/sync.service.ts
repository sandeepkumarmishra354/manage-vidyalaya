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

      try {
        await this.mirrorRelationalTable(tenantId, change);
      } catch (e) {
        // Non-fatal: sync_log (written above) is the source of truth used to
        // replay state to other devices regardless of mirror outcome. The
        // relational mirror only serves cloud-api's own direct queries
        // (auth, RBAC) for the handful of tables it needs to read without a
        // device being online -- see the design note atop schema.prisma.
        console.error(
          `relational mirror upsert failed for ${change.entity_table}:${change.entity_id}`,
          e,
        );
      }

      results.push({
        entity_table: change.entity_table,
        entity_id: change.entity_id,
        server_seq: Number(row.serverSeq),
        accepted: true,
      });
    }

    return results;
  }

  /**
   * A handful of tables are also modeled relationally in Postgres (see
   * schema.prisma design note) because cloud-api needs to query them
   * directly -- auth (users/roles) and RBAC enforcement (role_permissions)
   * -- independent of any desktop client being online. Every other synced
   * table lives only in sync_log. `payload` is the full row snapshot in the
   * same snake_case shape as the SQLite table, produced by
   * enqueue_outbox_from_row on the desktop side.
   */
  private async mirrorRelationalTable(tenantId: string, change: SyncChangeDto): Promise<void> {
    const p = change.payload as Record<string, any>;
    const toDate = (v: unknown): Date | null => (v ? new Date(v as string) : null);

    switch (change.entity_table) {
      case "branches":
        await this.prisma.branch.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            tenantId,
            name: p.name,
            code: p.code,
            address: p.address ?? null,
            city: p.city ?? null,
            state: p.state ?? null,
            pincode: p.pincode ?? null,
            isActive: !!p.is_active,
            updatedAt: new Date(p.updated_at),
            updatedBy: p.updated_by ?? null,
            deletedAt: toDate(p.deleted_at),
            version: p.version ?? 1,
          },
          update: {
            name: p.name,
            code: p.code,
            address: p.address ?? null,
            city: p.city ?? null,
            state: p.state ?? null,
            pincode: p.pincode ?? null,
            isActive: !!p.is_active,
            updatedAt: new Date(p.updated_at),
            updatedBy: p.updated_by ?? null,
            deletedAt: toDate(p.deleted_at),
            version: p.version ?? 1,
          },
        });
        return;

      case "roles":
        await this.prisma.role.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            tenantId,
            name: p.name,
            isSystem: !!p.is_system,
            updatedAt: new Date(p.updated_at),
            deletedAt: toDate(p.deleted_at),
            version: p.version ?? 1,
          },
          update: {
            name: p.name,
            isSystem: !!p.is_system,
            updatedAt: new Date(p.updated_at),
            deletedAt: toDate(p.deleted_at),
            version: p.version ?? 1,
          },
        });
        return;

      case "users":
        // passwordHash is intentionally never written here -- it's set
        // server-side only via UsersModule (create login / reset password),
        // never pushed from desktop (which never holds a plaintext or
        // rehashable password to push in the first place).
        await this.prisma.user.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            tenantId,
            branchId: p.branch_id ?? null,
            fullName: p.full_name,
            email: p.email,
            phone: p.phone ?? null,
            isActive: p.is_active === undefined ? true : !!p.is_active,
            updatedAt: new Date(p.updated_at),
            updatedBy: p.updated_by ?? null,
            deletedAt: toDate(p.deleted_at),
            version: p.version ?? 1,
          },
          update: {
            branchId: p.branch_id ?? null,
            fullName: p.full_name,
            email: p.email,
            phone: p.phone ?? null,
            isActive: p.is_active === undefined ? true : !!p.is_active,
            updatedAt: new Date(p.updated_at),
            updatedBy: p.updated_by ?? null,
            deletedAt: toDate(p.deleted_at),
            version: p.version ?? 1,
          },
        });
        return;

      case "user_roles":
        await this.prisma.userRole.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            tenantId,
            userId: p.user_id,
            roleId: p.role_id,
            updatedAt: new Date(p.updated_at),
            version: p.version ?? 1,
          },
          update: { updatedAt: new Date(p.updated_at), version: p.version ?? 1 },
        });
        return;

      case "role_permissions":
        await this.prisma.rolePermission.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            tenantId,
            roleId: p.role_id,
            permissionKey: p.permission_key,
            updatedAt: new Date(p.updated_at),
            updatedBy: p.updated_by ?? null,
            deletedAt: toDate(p.deleted_at),
            version: p.version ?? 1,
          },
          update: {
            permissionKey: p.permission_key,
            updatedAt: new Date(p.updated_at),
            updatedBy: p.updated_by ?? null,
            deletedAt: toDate(p.deleted_at),
            version: p.version ?? 1,
          },
        });
        return;

      default:
        return; // not a relationally-mirrored table -- sync_log alone is sufficient
    }
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
