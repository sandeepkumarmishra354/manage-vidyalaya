import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { findManyForTenant, findOneForTenant, insertRow, softDeleteRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { CreateLeaveTypeDto } from "./dto/create-leave-type.dto.js";
import type { SetLeaveTypeQuotasDto } from "./dto/set-leave-type-quotas.dto.js";
import type { UpdateLeaveTypeDto } from "./dto/update-leave-type.dto.js";
import { accruedEntitlementDays } from "./leave-entitlement.js";

const TYPES_TABLE = "leave_types";
const QUOTAS_TABLE = "leave_type_quotas";

export interface LeaveTypeRow extends TenantRow {
  name: string;
  is_system: boolean;
  quota_enabled: boolean;
}

export interface LeaveTypeQuotaRow extends TenantRow {
  leave_type_id: string;
  staff_category_id: string | null;
  monthly_accrual_days: string; // numeric(4,2) comes back as a string from pg
}

@Injectable()
export class LeaveTypesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  listTypes(tenantId: string) {
    return this.db.withTransaction(tenantId, (client) =>
      findManyForTenant<LeaveTypeRow>(client, TYPES_TABLE, tenantId, {}, "name ASC"),
    );
  }

  async createType(tenantId: string, actorUserId: string, dto: CreateLeaveTypeDto) {
    const now = new Date();
    return this.db.withTransaction(tenantId, async (client) => {
      const created = await insertRow<LeaveTypeRow>(client, TYPES_TABLE, tenantId, {
        name: dto.name,
        is_system: false,
        quota_enabled: dto.quota_enabled ?? false,
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: TYPES_TABLE,
        entityId: created.id,
        action: "create",
        summary: `Created leave type '${dto.name}'`,
      });

      return created;
    });
  }

  async updateType(tenantId: string, actorUserId: string, id: string, dto: UpdateLeaveTypeDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<LeaveTypeRow>(client, TYPES_TABLE, tenantId, id);
      if (!existing) {
        throw new NotFoundException("leave type not found");
      }

      const now = new Date();
      const updated = await updateRow<LeaveTypeRow>(client, TYPES_TABLE, tenantId, id, {
        name: dto.name ?? existing.name,
        quota_enabled: dto.quota_enabled ?? existing.quota_enabled,
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: TYPES_TABLE,
        entityId: id,
        action: "update",
        summary: `Updated leave type '${updated.name}'`,
      });

      return updated;
    });
  }

  // Blocked for a seeded default type or one already referenced by a leave
  // request -- deleting it out from under an existing request would orphan
  // its leave_type_id.
  async deleteType(tenantId: string, actorUserId: string, id: string) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<LeaveTypeRow>(client, TYPES_TABLE, tenantId, id);
      if (!existing) {
        throw new NotFoundException("leave type not found");
      }
      if (existing.is_system) {
        throw new BadRequestException("cannot delete a default leave type");
      }

      const referenced = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM staff_leave_requests WHERE tenant_id = $1 AND leave_type_id = $2 AND deleted_at IS NULL",
        [tenantId, id],
      );
      if (Number(referenced.rows[0]?.count ?? "0") > 0) {
        throw new BadRequestException("cannot delete a leave type that has requests against it");
      }

      const deleted = await softDeleteRow<LeaveTypeRow>(client, TYPES_TABLE, tenantId, id, actorUserId);

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: TYPES_TABLE,
        entityId: id,
        action: "delete",
        summary: `Deleted leave type '${existing.name}'`,
      });

      return deleted;
    });
  }

  listQuotas(tenantId: string, leaveTypeId: string) {
    return this.db.withTransaction(tenantId, (client) =>
      findManyForTenant<LeaveTypeQuotaRow>(client, QUOTAS_TABLE, tenantId, { leave_type_id: leaveTypeId }),
    );
  }

  // Wholesale replace: soft-deletes every existing quota row for this leave
  // type, then inserts the given set fresh. Quota configuration is small
  // (one row per staff category plus a default) and edited as a whole from
  // the admin UI, so a diff isn't worth the complexity.
  async setQuotas(tenantId: string, actorUserId: string, leaveTypeId: string, dto: SetLeaveTypeQuotasDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const leaveType = await findOneForTenant<LeaveTypeRow>(client, TYPES_TABLE, tenantId, leaveTypeId);
      if (!leaveType) {
        throw new NotFoundException("leave type not found");
      }

      const existing = await findManyForTenant<LeaveTypeQuotaRow>(client, QUOTAS_TABLE, tenantId, {
        leave_type_id: leaveTypeId,
      });
      const now = new Date();
      for (const row of existing) {
        await softDeleteRow(client, QUOTAS_TABLE, tenantId, row.id, actorUserId);
      }

      const created: LeaveTypeQuotaRow[] = [];
      for (const entry of dto.quotas) {
        created.push(
          await insertRow<LeaveTypeQuotaRow>(client, QUOTAS_TABLE, tenantId, {
            leave_type_id: leaveTypeId,
            staff_category_id: entry.staff_category_id ?? null,
            monthly_accrual_days: entry.monthly_accrual_days,
            updated_at: now,
            updated_by: actorUserId,
          }),
        );
      }

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: QUOTAS_TABLE,
        entityId: leaveTypeId,
        action: "update",
        summary: `Set leave quotas for '${leaveType.name}' (${created.length} categor${created.length === 1 ? "y" : "ies"})`,
      });

      return created;
    });
  }

  // The monthly accrual that applies to a given staff member for a leave
  // type: the category-specific row if one exists, else the default
  // (staff_category_id IS NULL) row, else null if nothing has been
  // configured at all (callers treat null as "unlimited/paid", the same as
  // a non-quota-enabled type -- an admin turning quota_enabled on without
  // configuring any quota yet shouldn't silently start marking leave unpaid).
  async resolveMonthlyAccrual(
    client: PoolClient,
    tenantId: string,
    leaveTypeId: string,
    staffCategoryId: string | null,
  ): Promise<number | null> {
    if (staffCategoryId) {
      const specific = await client.query<LeaveTypeQuotaRow>(
        "SELECT * FROM leave_type_quotas WHERE tenant_id = $1 AND leave_type_id = $2 AND staff_category_id = $3 AND deleted_at IS NULL",
        [tenantId, leaveTypeId, staffCategoryId],
      );
      if (specific.rows[0]) return Number(specific.rows[0].monthly_accrual_days);
    }
    const fallback = await client.query<LeaveTypeQuotaRow>(
      "SELECT * FROM leave_type_quotas WHERE tenant_id = $1 AND leave_type_id = $2 AND staff_category_id IS NULL AND deleted_at IS NULL",
      [tenantId, leaveTypeId],
    );
    if (fallback.rows[0]) return Number(fallback.rows[0].monthly_accrual_days);
    return null;
  }

  // Used-so-far this calendar year, from the paid_days already recorded on
  // approved requests -- bucketed by each request's start_date year. A
  // request spanning a year boundary (e.g. 30 Dec - 2 Jan) is counted
  // entirely in its start year here, a known simplification for this
  // read-only "used so far" total (the day-by-day accrual check at
  // approval time, in StaffLeaveService, is still correct per-day).
  async usedDaysInYear(
    client: PoolClient,
    tenantId: string,
    staffId: string,
    leaveTypeId: string,
    year: number,
    excludeRequestId?: string,
  ): Promise<number> {
    const values: unknown[] = [tenantId, staffId, leaveTypeId, year];
    let excludeClause = "";
    if (excludeRequestId) {
      values.push(excludeRequestId);
      excludeClause = `AND id != $${values.length}`;
    }
    const result = await client.query<{ total: string | null }>(
      `SELECT SUM(paid_days)::text AS total FROM staff_leave_requests
       WHERE tenant_id = $1 AND staff_id = $2 AND leave_type_id = $3 AND status = 'approved'
         AND deleted_at IS NULL AND EXTRACT(YEAR FROM start_date) = $4 ${excludeClause}`,
      values,
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  // Read-only balance preview for the "mine"/HR balance endpoints -- one
  // entry per quota_enabled leave type, whether or not a quota has actually
  // been configured for this staff member's category (remaining is null in
  // that case, matching resolveMonthlyAccrual's "unconfigured = unlimited").
  async getBalance(tenantId: string, staffId: string, staffCategoryId: string | null, dateOfJoining: Date, asOfDate: Date) {
    return this.db.withTransaction(tenantId, async (client) => {
      const types = await findManyForTenant<LeaveTypeRow>(client, TYPES_TABLE, tenantId, { quota_enabled: true }, "name ASC");
      const year = asOfDate.getUTCFullYear();

      const balances = [];
      for (const type of types) {
        const monthlyAccrual = await this.resolveMonthlyAccrual(client, tenantId, type.id, staffCategoryId);
        const used = await this.usedDaysInYear(client, tenantId, staffId, type.id, year);
        const accrued = monthlyAccrual == null ? null : accruedEntitlementDays(monthlyAccrual, dateOfJoining, asOfDate);
        balances.push({
          leave_type_id: type.id,
          leave_type_name: type.name,
          monthly_accrual_days: monthlyAccrual,
          accrued_days: accrued,
          used_days: used,
          remaining_days: accrued == null ? null : Math.max(0, accrued - used),
        });
      }
      return balances;
    });
  }
}
