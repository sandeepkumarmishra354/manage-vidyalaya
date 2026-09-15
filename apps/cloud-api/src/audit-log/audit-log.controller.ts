import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { RequirePermission } from "../common/require-permission.decorator.js";
import { PrismaService } from "../prisma/prisma.service.js";

const PAGE_SIZE = 100;

@Controller("audit-log")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly prisma: PrismaService) {}

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

    const entries = await this.prisma.auditLog.findMany({
      where: {
        tenantId: user.tenant_id,
        ...(entityTable ? { entityTable } : {}),
        ...(actorUserId ? { actorUserId } : {}),
        ...(fromDate || toDate
          ? {
              createdAt: {
                ...(fromDate ? { gte: new Date(fromDate) } : {}),
                ...(toDate ? { lte: new Date(toDate) } : {}),
              },
            }
          : {}),
      },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: pageNum * PAGE_SIZE,
    });

    return entries.map((e) => ({
      id: e.id,
      actor_name: e.actor?.fullName ?? null,
      entity_table: e.entityTable,
      entity_id: e.entityId,
      action: e.action,
      summary: e.summary,
      created_at: e.createdAt,
    }));
  }
}
