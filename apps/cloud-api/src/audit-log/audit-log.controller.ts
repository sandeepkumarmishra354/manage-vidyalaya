import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { DbService } from "../db/db.service.js";

const PAGE_SIZE = 100;

@Controller("audit-log")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly db: DbService) {}

  @Get()
  @RequirePermission("audit.view")
  async list(
    @CurrentUser() user: JwtPayload,
    @Query("entity_table") entityTable?: string,
    @Query("actor_user_id") actorUserId?: string,
    @Query("from_date") fromDate?: string,
    @Query("to_date") toDate?: string,
    @Query("page") page?: string,
  ) {
    const pageNum = Math.max(Number(page ?? 0) || 0, 0);

    const conditions = ["al.tenant_id = $1"];
    const values: unknown[] = [user.tenant_id];
    if (entityTable) {
      values.push(entityTable);
      conditions.push(`al.entity_table = $${values.length}`);
    }
    if (actorUserId) {
      values.push(actorUserId);
      conditions.push(`al.actor_user_id = $${values.length}`);
    }
    if (fromDate) {
      values.push(new Date(fromDate));
      conditions.push(`al.created_at >= $${values.length}`);
    }
    if (toDate) {
      values.push(new Date(toDate));
      conditions.push(`al.created_at <= $${values.length}`);
    }
    values.push(PAGE_SIZE, pageNum * PAGE_SIZE);

    const rows = await this.db.query<{
      id: string;
      full_name: string | null;
      entity_table: string;
      entity_id: string;
      action: string;
      summary: string;
      created_at: Date;
    }>(
      user.tenant_id,
      `SELECT al.id, u.full_name, al.entity_table, al.entity_id, al.action, al.summary, al.created_at
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.actor_user_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY al.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );

    return rows.map((e) => ({
      id: e.id,
      actor_name: e.full_name,
      entity_table: e.entity_table,
      entity_id: e.entity_id,
      action: e.action,
      summary: e.summary,
      created_at: e.created_at,
    }));
  }
}
