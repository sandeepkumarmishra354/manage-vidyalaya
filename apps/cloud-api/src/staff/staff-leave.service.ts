import { randomUUID } from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service.js";
import { ScopedAccessService } from "../common/scoped-access.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ApplyStaffLeaveDto } from "./dto/apply-staff-leave.dto.js";
import type { DecideStaffLeaveDto } from "./dto/decide-staff-leave.dto.js";
import type { FileStaffLeaveDto } from "./dto/file-staff-leave.dto.js";
import { staffAllowsAccess } from "./staff-status.js";

function toListItem(r: {
  id: string;
  staffId: string;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  status: string;
  requestedByUserId: string;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    staff_id: r.staffId,
    start_date: r.startDate,
    end_date: r.endDate,
    reason: r.reason,
    status: r.status,
    requested_by_user_id: r.requestedByUserId,
    decided_by_user_id: r.decidedByUserId,
    decided_at: r.decidedAt,
    decision_note: r.decisionNote,
    created_at: r.createdAt,
  };
}

@Injectable()
export class StaffLeaveService {
  constructor(
    private readonly prisma: PrismaService,
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
    return staff;
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

    return this.prisma.staffLeaveRequest.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: staff.branchId,
        staffId: staff.id,
        startDate: new Date(dto.start_date),
        endDate: new Date(dto.end_date),
        reason: dto.reason ?? null,
        status: "pending",
        requestedByUserId: actorUserId,
        createdAt: now,
        updatedAt: now,
        updatedBy: actorUserId,
      },
    });
  }

  async listMine(tenantId: string, actorUserId: string) {
    const staff = await this.requireActingStaff(tenantId, actorUserId);
    const rows = await this.prisma.staffLeaveRequest.findMany({
      where: { staffId: staff.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toListItem);
  }

  async cancel(tenantId: string, actorUserId: string, id: string) {
    const staff = await this.requireActingStaff(tenantId, actorUserId);
    const existing = await this.prisma.staffLeaveRequest.findFirst({
      where: { id, staffId: staff.id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException("leave request not found");
    }
    if (existing.status !== "pending") {
      throw new BadRequestException("only a pending request can be cancelled");
    }
    const now = new Date();

    return this.prisma.staffLeaveRequest.update({
      where: { id },
      data: { status: "cancelled", updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
    });
  }

  // HR on-behalf filing: the filer already holds approval authority, so
  // this is created straight into "approved" and immediately writes
  // attendance -- no pointless self-approval step.
  async file(tenantId: string, actorUserId: string, dto: FileStaffLeaveDto) {
    if (dto.end_date < dto.start_date) {
      throw new BadRequestException("end date must be on or after the start date");
    }
    const staff = await this.prisma.staff.findFirst({ where: { id: dto.staff_id, tenantId, deletedAt: null } });
    if (!staff) {
      throw new NotFoundException("staff member not found");
    }
    if (!staffAllowsAccess(staff.status)) {
      throw new ForbiddenException("Cannot file leave for a staff member who isn't active.");
    }
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const id = randomUUID();
      const request = await tx.staffLeaveRequest.create({
        data: {
          id,
          tenantId,
          branchId: staff.branchId,
          staffId: staff.id,
          startDate: new Date(dto.start_date),
          endDate: new Date(dto.end_date),
          reason: dto.reason ?? null,
          status: "approved",
          requestedByUserId: actorUserId,
          decidedByUserId: actorUserId,
          decidedAt: now,
          createdAt: now,
          updatedAt: now,
          updatedBy: actorUserId,
        },
      });

      await this.writeAttendanceForRange(tx, tenantId, staff.branchId, staff.id, dto.start_date, dto.end_date, actorUserId);

      await this.audit.record(tx, {
        tenantId,
        branchId: staff.branchId,
        actorUserId,
        entityTable: "staff_leave_requests",
        entityId: id,
        action: "create",
        summary: `Filed and approved leave for ${staff.firstName} ${staff.lastName ?? ""}`.trim(),
      });

      return request;
    });
  }

  async listForBranch(tenantId: string, branchId: string, status?: string) {
    const rows = await this.prisma.staffLeaveRequest.findMany({
      where: { tenantId, branchId, deletedAt: null, ...(status ? { status } : {}) },
      include: { staff: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      ...toListItem(r),
      staff_name: [r.staff.firstName, r.staff.lastName].filter(Boolean).join(" "),
    }));
  }

  async decide(tenantId: string, actorUserId: string, id: string, dto: DecideStaffLeaveDto) {
    const existing = await this.prisma.staffLeaveRequest.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { staff: true },
    });
    if (!existing) {
      throw new NotFoundException("leave request not found");
    }
    if (existing.status !== "pending") {
      throw new BadRequestException("this request has already been decided");
    }
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.staffLeaveRequest.update({
        where: { id },
        data: {
          status: dto.decision,
          decidedByUserId: actorUserId,
          decidedAt: now,
          decisionNote: dto.note ?? null,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      if (dto.decision === "approved") {
        await this.writeAttendanceForRange(
          tx,
          tenantId,
          existing.branchId,
          existing.staffId,
          existing.startDate.toISOString().slice(0, 10),
          existing.endDate.toISOString().slice(0, 10),
          actorUserId,
        );
      }

      await this.audit.record(tx, {
        tenantId,
        branchId: existing.branchId,
        actorUserId,
        entityTable: "staff_leave_requests",
        entityId: id,
        action: "update",
        summary: `${dto.decision === "approved" ? "Approved" : "Rejected"} leave request for ${existing.staff.firstName} ${existing.staff.lastName ?? ""}`.trim(),
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
    tx: Prisma.TransactionClient,
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
      await tx.staffAttendance.upsert({
        where: { tenantId_staffId_attendanceDate: { tenantId, staffId, attendanceDate } },
        create: {
          id: randomUUID(),
          tenantId,
          branchId,
          staffId,
          attendanceDate,
          status: "leave",
          markedBy: actorUserId,
          updatedAt: now,
          updatedBy: actorUserId,
        },
        update: {
          status: "leave",
          markedBy: actorUserId,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });
    }
  }
}
