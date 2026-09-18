import { randomUUID } from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";

import { AuditService } from "../audit/audit.service.js";
import { ScopedAccessService } from "../common/scoped-access.service.js";
import { DbService } from "../db/db.service.js";
import { findOneForTenant, insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
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
}

function toListItem(r: StaffLeaveRequestRow) {
  return {
    id: r.id,
    staff_id: r.staff_id,
    start_date: r.start_date,
    end_date: r.end_date,
    reason: r.reason,
    status: r.status,
    requested_by_user_id: r.requested_by_user_id,
    decided_by_user_id: r.decided_by_user_id,
    decided_at: r.decided_at,
    decision_note: r.decision_note,
    created_at: r.created_at,
  };
}

@Injectable()
export class StaffLeaveService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly scopedAccess: ScopedAccessService,
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
    const now = new Date();

    return this.db.withTransaction(tenantId, async (client) => {
      return insertRow<StaffLeaveRequestRow>(client, "staff_leave_requests", tenantId, {
        branch_id: staff.branch_id,
        staff_id: staff.id,
        start_date: new Date(dto.start_date),
        end_date: new Date(dto.end_date),
        reason: dto.reason ?? null,
        status: "pending",
        requested_by_user_id: actorUserId,
        created_at: now,
        updated_at: now,
        updated_by: actorUserId,
      });
    });
  }

  async listMine(tenantId: string, actorUserId: string) {
    const staff = await this.requireActingStaff(tenantId, actorUserId);
    const rows = await this.db.query<StaffLeaveRequestRow>(
      tenantId,
      "SELECT * FROM staff_leave_requests WHERE tenant_id = $1 AND staff_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC",
      [tenantId, staff.id],
    );
    return rows.map(toListItem);
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

    return this.db.withTransaction(tenantId, async (client) => {
      const staff = await findOneForTenant<StaffRow>(client, "staff", tenantId, dto.staff_id);
      if (!staff) {
        throw new NotFoundException("staff member not found");
      }
      if (!staffAllowsAccess(staff.status)) {
        throw new ForbiddenException("Cannot file leave for a staff member who isn't active.");
      }
      const now = new Date();

      const request = await insertRow<StaffLeaveRequestRow>(client, "staff_leave_requests", tenantId, {
        branch_id: staff.branch_id,
        staff_id: staff.id,
        start_date: new Date(dto.start_date),
        end_date: new Date(dto.end_date),
        reason: dto.reason ?? null,
        status: "approved",
        requested_by_user_id: actorUserId,
        decided_by_user_id: actorUserId,
        decided_at: now,
        created_at: now,
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.writeAttendanceForRange(client, tenantId, staff.branch_id, staff.id, dto.start_date, dto.end_date, actorUserId);

      await this.audit.record(client, {
        tenantId,
        branchId: staff.branch_id,
        actorUserId,
        entityTable: "staff_leave_requests",
        entityId: request.id,
        action: "create",
        summary: `Filed and approved leave for ${staff.first_name} ${staff.last_name ?? ""}`.trim(),
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
      StaffLeaveRequestRow & { staff_first_name: string; staff_last_name: string | null }
    >(
      tenantId,
      `SELECT lr.*, s.first_name AS staff_first_name, s.last_name AS staff_last_name
       FROM staff_leave_requests lr
       JOIN staff s ON s.id = lr.staff_id
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
        StaffLeaveRequestRow & { staff_first_name: string; staff_last_name: string | null }
      >(
        `SELECT lr.*, s.first_name AS staff_first_name, s.last_name AS staff_last_name
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

      const updated = await updateRow<StaffLeaveRequestRow>(client, "staff_leave_requests", tenantId, id, {
        status: dto.decision,
        decided_by_user_id: actorUserId,
        decided_at: now,
        decision_note: dto.note ?? null,
        updated_at: now,
        updated_by: actorUserId,
      });

      if (dto.decision === "approved") {
        await this.writeAttendanceForRange(
          client,
          tenantId,
          existing.branch_id,
          existing.staff_id,
          existing.start_date.toISOString().slice(0, 10),
          existing.end_date.toISOString().slice(0, 10),
          actorUserId,
        );
      }

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

  // Writes a StaffAttendance row (status "leave") for every date in the
  // inclusive range, reusing the same upsert-by-(tenant,staff,date) shape
  // as StaffAttendanceService.markAttendanceBulk. Payroll's LOP calculation
  // already treats "leave" as a fully paid, non-deducted day, so no payroll
  // changes are needed here.
  private async writeAttendanceForRange(
    client: PoolClient,
    tenantId: string,
    branchId: string,
    staffId: string,
    startDate: string,
    endDate: string,
    actorUserId: string,
  ) {
    const now = new Date();
    const end = new Date(endDate);
    for (const d = new Date(startDate); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const attendanceDate = new Date(d);
      await client.query(
        `INSERT INTO staff_attendance (id, tenant_id, branch_id, staff_id, attendance_date, status, marked_by, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, 'leave', $6, $7, $6)
         ON CONFLICT (tenant_id, staff_id, attendance_date)
         DO UPDATE SET status = 'leave', marked_by = EXCLUDED.marked_by,
           updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by, version = staff_attendance.version + 1`,
        [randomUUID(), tenantId, branchId, staffId, attendanceDate, actorUserId, now],
      );
    }
  }
}
