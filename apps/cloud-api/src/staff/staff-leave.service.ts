import { randomUUID } from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";

import { AuditService } from "../audit/audit.service.js";
import { ScopedAccessService } from "../common/scoped-access.service.js";
import { DbService } from "../db/db.service.js";
import { findOneForTenant, insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import { accruedEntitlementDays } from "../leave-types/leave-entitlement.js";
import type { LeaveTypeRow } from "../leave-types/leave-types.service.js";
import { LeaveTypesService } from "../leave-types/leave-types.service.js";
import type { ApplyStaffLeaveDto } from "./dto/apply-staff-leave.dto.js";
import type { DecideStaffLeaveDto } from "./dto/decide-staff-leave.dto.js";
import type { FileStaffLeaveDto } from "./dto/file-staff-leave.dto.js";
import type { StaffRow } from "./staff.service.js";
import { staffAllowsAccess } from "./staff-status.js";

export interface StaffLeaveRequestRow extends TenantRow {
  branch_id: string;
  staff_id: string;
  start_date: Date;
  end_date: Date;
  reason: string | null;
  status: string;
  requested_by_user_id: string;
  decided_by_user_id: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  created_at: Date;
  is_half_day: boolean;
  leave_type_id: string | null;
  paid_days: string | null; // numeric(4,2) comes back as a string from pg
  unpaid_days: string | null;
}

function toListItem(r: StaffLeaveRequestRow & { leave_type_name?: string | null }) {
  return {
    id: r.id,
    staff_id: r.staff_id,
    leave_type_id: r.leave_type_id,
    leave_type_name: r.leave_type_name ?? null,
    start_date: r.start_date,
    end_date: r.end_date,
    reason: r.reason,
    status: r.status,
    requested_by_user_id: r.requested_by_user_id,
    decided_by_user_id: r.decided_by_user_id,
    decided_at: r.decided_at,
    decision_note: r.decision_note,
    created_at: r.created_at,
    is_half_day: r.is_half_day,
    paid_days: r.paid_days == null ? null : Number(r.paid_days),
    unpaid_days: r.unpaid_days == null ? null : Number(r.unpaid_days),
  };
}

interface DayPlan {
  dayStatuses: Map<string, string>; // iso date -> staff_attendance.status
  paidDays: number;
  unpaidDays: number;
}

@Injectable()
export class StaffLeaveService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly scopedAccess: ScopedAccessService,
    private readonly leaveTypes: LeaveTypesService,
  ) {}

  // Self-service routes are gated on ownership (does this login have a
  // linked Staff row) rather than a flat permission, matching how a class
  // teacher's narrower rights are already additive on top of, not gated
  // by, the flat permission model elsewhere in this codebase.
  private async requireActingStaff(tenantId: string, userId: string) {
    const staff = await this.scopedAccess.getActingStaff(tenantId, userId);
    if (!staff) {
      throw new ForbiddenException("your account isn't linked to a staff record");
    }
    return staff as StaffRow;
  }

  async apply(tenantId: string, actorUserId: string, dto: ApplyStaffLeaveDto) {
    const staff = await this.requireActingStaff(tenantId, actorUserId);
    if (!staffAllowsAccess(staff.status)) {
      throw new ForbiddenException("Only active staff can apply for leave.");
    }
    if (dto.end_date < dto.start_date) {
      throw new BadRequestException("end date must be on or after the start date");
    }
    if (dto.is_half_day && dto.start_date !== dto.end_date) {
      throw new BadRequestException("half-day leave must have the same start and end date");
    }
    const now = new Date();

    return this.db.withTransaction(tenantId, async (client) => {
      const leaveType = await findOneForTenant<LeaveTypeRow>(client, "leave_types", tenantId, dto.leave_type_id);
      if (!leaveType) {
        throw new NotFoundException("leave type not found");
      }

      return insertRow<StaffLeaveRequestRow>(client, "staff_leave_requests", tenantId, {
        branch_id: staff.branch_id,
        staff_id: staff.id,
        leave_type_id: dto.leave_type_id,
        start_date: new Date(dto.start_date),
        end_date: new Date(dto.end_date),
        reason: dto.reason ?? null,
        status: "pending",
        requested_by_user_id: actorUserId,
        is_half_day: dto.is_half_day ?? false,
        created_at: now,
        updated_at: now,
        updated_by: actorUserId,
      });
    });
  }

  async listMine(tenantId: string, actorUserId: string) {
    const staff = await this.requireActingStaff(tenantId, actorUserId);
    const rows = await this.db.query<StaffLeaveRequestRow & { leave_type_name: string | null }>(
      tenantId,
      `SELECT lr.*, lt.name AS leave_type_name FROM staff_leave_requests lr
       LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.tenant_id = $1 AND lr.staff_id = $2 AND lr.deleted_at IS NULL ORDER BY lr.created_at DESC`,
      [tenantId, staff.id],
    );
    return rows.map(toListItem);
  }

  async myBalance(tenantId: string, actorUserId: string) {
    const staff = await this.requireActingStaff(tenantId, actorUserId);
    return this.leaveTypes.getBalance(tenantId, staff.id, staff.category_id, staff.date_of_joining, new Date());
  }

  async staffBalance(tenantId: string, staffId: string) {
    const staff = await this.db.queryOne<StaffRow>(
      tenantId,
      "SELECT * FROM staff WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
      [tenantId, staffId],
    );
    if (!staff) {
      throw new NotFoundException("staff member not found");
    }
    return this.leaveTypes.getBalance(tenantId, staff.id, staff.category_id, staff.date_of_joining, new Date());
  }

  async cancel(tenantId: string, actorUserId: string, id: string) {
    const staff = await this.requireActingStaff(tenantId, actorUserId);

    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<StaffLeaveRequestRow>(client, "staff_leave_requests", tenantId, id);
      if (!existing || existing.staff_id !== staff.id) {
        throw new NotFoundException("leave request not found");
      }
      if (existing.status !== "pending") {
        throw new BadRequestException("only a pending request can be cancelled");
      }

      return updateRow<StaffLeaveRequestRow>(client, "staff_leave_requests", tenantId, id, {
        status: "cancelled",
        updated_at: new Date(),
        updated_by: actorUserId,
      });
    });
  }

  // HR on-behalf filing: the filer already holds approval authority, so
  // this is created straight into "approved" and immediately writes
  // attendance -- no pointless self-approval step.
  async file(tenantId: string, actorUserId: string, dto: FileStaffLeaveDto) {
    if (dto.end_date < dto.start_date) {
      throw new BadRequestException("end date must be on or after the start date");
    }
    if (dto.is_half_day && dto.start_date !== dto.end_date) {
      throw new BadRequestException("half-day leave must have the same start and end date");
    }

    return this.db.withTransaction(tenantId, async (client) => {
      const staff = await findOneForTenant<StaffRow>(client, "staff", tenantId, dto.staff_id);
      if (!staff) {
        throw new NotFoundException("staff member not found");
      }
      if (!staffAllowsAccess(staff.status)) {
        throw new ForbiddenException("Cannot file leave for a staff member who isn't active.");
      }
      const leaveType = await findOneForTenant<LeaveTypeRow>(client, "leave_types", tenantId, dto.leave_type_id);
      if (!leaveType) {
        throw new NotFoundException("leave type not found");
      }
      const now = new Date();

      const plan = await this.planLeaveDays(client, tenantId, staff, leaveType, dto.start_date, dto.end_date, dto.is_half_day ?? false);

      const request = await insertRow<StaffLeaveRequestRow>(client, "staff_leave_requests", tenantId, {
        branch_id: staff.branch_id,
        staff_id: staff.id,
        leave_type_id: dto.leave_type_id,
        start_date: new Date(dto.start_date),
        end_date: new Date(dto.end_date),
        reason: dto.reason ?? null,
        status: "approved",
        requested_by_user_id: actorUserId,
        decided_by_user_id: actorUserId,
        decided_at: now,
        is_half_day: dto.is_half_day ?? false,
        paid_days: leaveType.quota_enabled ? plan.paidDays : null,
        unpaid_days: leaveType.quota_enabled ? plan.unpaidDays : null,
        created_at: now,
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.writeAttendanceForRange(client, tenantId, staff.branch_id, staff.id, actorUserId, plan.dayStatuses);

      await this.audit.record(client, {
        tenantId,
        branchId: staff.branch_id,
        actorUserId,
        entityTable: "staff_leave_requests",
        entityId: request.id,
        action: "create",
        summary: `Filed and approved ${leaveType.name} for ${staff.first_name} ${staff.last_name ?? ""}`.trim(),
      });

      return request;
    });
  }

  async listForBranch(tenantId: string, branchId: string, status?: string) {
    const conditions = ["lr.tenant_id = $1", "lr.branch_id = $2", "lr.deleted_at IS NULL"];
    const values: unknown[] = [tenantId, branchId];
    if (status) {
      values.push(status);
      conditions.push(`lr.status = $${values.length}`);
    }

    const rows = await this.db.query<
      StaffLeaveRequestRow & { staff_first_name: string; staff_last_name: string | null; leave_type_name: string | null }
    >(
      tenantId,
      `SELECT lr.*, s.first_name AS staff_first_name, s.last_name AS staff_last_name, lt.name AS leave_type_name
       FROM staff_leave_requests lr
       JOIN staff s ON s.id = lr.staff_id
       LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY lr.created_at DESC`,
      values,
    );

    return rows.map((r) => ({
      ...toListItem(r),
      staff_name: [r.staff_first_name, r.staff_last_name].filter(Boolean).join(" "),
    }));
  }

  async decide(tenantId: string, actorUserId: string, id: string, dto: DecideStaffLeaveDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existingResult = await client.query<
        StaffLeaveRequestRow & {
          staff_first_name: string;
          staff_last_name: string | null;
          staff_category_id: string | null;
          staff_date_of_joining: Date;
        }
      >(
        `SELECT lr.*, s.first_name AS staff_first_name, s.last_name AS staff_last_name,
                s.category_id AS staff_category_id, s.date_of_joining AS staff_date_of_joining
         FROM staff_leave_requests lr
         JOIN staff s ON s.id = lr.staff_id
         WHERE lr.id = $1 AND lr.tenant_id = $2 AND lr.deleted_at IS NULL`,
        [id, tenantId],
      );
      const existing = existingResult.rows[0];
      if (!existing) {
        throw new NotFoundException("leave request not found");
      }
      if (existing.status !== "pending") {
        throw new BadRequestException("this request has already been decided");
      }
      const now = new Date();

      let paidDays: number | null = null;
      let unpaidDays: number | null = null;

      if (dto.decision === "approved") {
        const leaveType = existing.leave_type_id
          ? await findOneForTenant<LeaveTypeRow>(client, "leave_types", tenantId, existing.leave_type_id)
          : null;

        const startIso = existing.start_date.toISOString().slice(0, 10);
        const endIso = existing.end_date.toISOString().slice(0, 10);

        const plan = leaveType
          ? await this.planLeaveDays(
              client,
              tenantId,
              { id: existing.staff_id, category_id: existing.staff_category_id, date_of_joining: existing.staff_date_of_joining } as StaffRow,
              leaveType,
              startIso,
              endIso,
              existing.is_half_day,
              existing.id, // exclude this request from "used so far" -- it isn't approved yet
            )
          : this.uniformPlan(startIso, endIso, existing.is_half_day, "leave");

        if (leaveType?.quota_enabled) {
          paidDays = plan.paidDays;
          unpaidDays = plan.unpaidDays;
        }

        await this.writeAttendanceForRange(client, tenantId, existing.branch_id, existing.staff_id, actorUserId, plan.dayStatuses);
      }

      const updated = await updateRow<StaffLeaveRequestRow>(client, "staff_leave_requests", tenantId, id, {
        status: dto.decision,
        decided_by_user_id: actorUserId,
        decided_at: now,
        decision_note: dto.note ?? null,
        paid_days: paidDays,
        unpaid_days: unpaidDays,
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: existing.branch_id,
        actorUserId,
        entityTable: "staff_leave_requests",
        entityId: id,
        action: "update",
        summary: `${dto.decision === "approved" ? "Approved" : "Rejected"} leave request for ${existing.staff_first_name} ${existing.staff_last_name ?? ""}`.trim(),
      });

      return updated;
    });
  }

  // A uniform status for every day in the range -- today's pre-entitlement
  // behaviour, used when the request has no leave type or a non-quota one.
  private uniformPlan(startDate: string, endDate: string, isHalfDay: boolean, status: "leave" | "half_day"): DayPlan {
    const dayStatuses = new Map<string, string>();
    const end = new Date(endDate);
    let count = 0;
    for (const d = new Date(startDate); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      dayStatuses.set(d.toISOString().slice(0, 10), isHalfDay ? "half_day" : status);
      count++;
    }
    return { dayStatuses, paidDays: count, unpaidDays: 0 };
  }

  // Walks the request day by day, splitting into paid ("leave") and
  // unpaid/LOP ("leave_unpaid") days once the staff member's remaining
  // balance for this leave type/year is exhausted. Half-day leave is
  // always single-date and always fully paid (still "half_day" status,
  // same half-pay deduction as today) -- it still consumes 0.5 day from
  // the balance so it's reflected in later full-day checks, but is never
  // itself split into paid/unpaid; splitting a single half-day is more
  // complexity than the edge case warrants. A day is bucketed by its own
  // calendar year for the accrual check, so a request spanning New Year's
  // is still evaluated correctly per day even though the "used so far"
  // aggregate (LeaveTypesService.usedDaysInYear) buckets a whole request
  // by its start_date's year.
  private async planLeaveDays(
    client: PoolClient,
    tenantId: string,
    staff: Pick<StaffRow, "id" | "category_id" | "date_of_joining">,
    leaveType: LeaveTypeRow,
    startDate: string,
    endDate: string,
    isHalfDay: boolean,
    excludeRequestId?: string,
  ): Promise<DayPlan> {
    if (!leaveType.quota_enabled) {
      return this.uniformPlan(startDate, endDate, isHalfDay, "leave");
    }

    if (isHalfDay) {
      // Always paid (see method doc) -- the 0.5 still lands in paid_days,
      // so it's correctly counted by usedDaysInYear for later requests.
      return { dayStatuses: new Map([[startDate, "half_day"]]), paidDays: 0.5, unpaidDays: 0 };
    }

    const monthlyAccrual = await this.leaveTypes.resolveMonthlyAccrual(client, tenantId, leaveType.id, staff.category_id);
    if (monthlyAccrual == null) {
      // Quota turned on but never configured for this staff member's
      // category -- fail safe to unlimited/paid rather than silently
      // marking everything unpaid.
      return this.uniformPlan(startDate, endDate, false, "leave");
    }

    const dayStatuses = new Map<string, string>();
    const usedByYear = new Map<number, number>();
    let paidDays = 0;
    let unpaidDays = 0;
    const end = new Date(endDate);
    for (const d = new Date(startDate); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const year = d.getUTCFullYear();
      if (!usedByYear.has(year)) {
        usedByYear.set(year, await this.leaveTypes.usedDaysInYear(client, tenantId, staff.id, leaveType.id, year, excludeRequestId));
      }
      const accrued = accruedEntitlementDays(monthlyAccrual, staff.date_of_joining, d);
      const usedSoFar = usedByYear.get(year)!;
      if (usedSoFar < accrued) {
        dayStatuses.set(iso, "leave");
        paidDays += 1;
        usedByYear.set(year, usedSoFar + 1);
      } else {
        dayStatuses.set(iso, "leave_unpaid");
        unpaidDays += 1;
      }
    }

    return { dayStatuses, paidDays, unpaidDays };
  }

  // Writes a StaffAttendance row for every date in dayStatuses, reusing the
  // same upsert-by-(tenant,staff,date) shape as
  // StaffAttendanceService.markAttendanceBulk.
  private async writeAttendanceForRange(
    client: PoolClient,
    tenantId: string,
    branchId: string,
    staffId: string,
    actorUserId: string,
    dayStatuses: Map<string, string>,
  ) {
    const now = new Date();
    for (const [iso, status] of dayStatuses) {
      await client.query(
        `INSERT INTO staff_attendance (id, tenant_id, branch_id, staff_id, attendance_date, status, marked_by, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7)
         ON CONFLICT (tenant_id, staff_id, attendance_date)
         DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by,
           updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by, version = staff_attendance.version + 1`,
        [randomUUID(), tenantId, branchId, staffId, new Date(iso), status, actorUserId, now],
      );
    }
  }
}
