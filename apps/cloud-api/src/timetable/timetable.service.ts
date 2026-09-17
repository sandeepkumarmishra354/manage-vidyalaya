import { randomUUID } from "node:crypto";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service.js";
import { ScopedAccessService } from "../common/scoped-access.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import type { CreatePeriodSlotDto } from "./dto/create-period-slot.dto.js";
import type { SaveSectionTimetableDto } from "./dto/save-section-timetable.dto.js";
import type { UpdatePeriodSlotDto } from "./dto/update-period-slot.dto.js";

function toPeriodSlot(p: {
  id: string;
  branchId: string;
  academicSessionId: string;
  name: string;
  sortOrder: number;
  startTime: string;
  endTime: string;
  periodType: string;
}) {
  return {
    id: p.id,
    branch_id: p.branchId,
    academic_session_id: p.academicSessionId,
    name: p.name,
    sort_order: p.sortOrder,
    start_time: p.startTime,
    end_time: p.endTime,
    period_type: p.periodType,
  };
}

@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopedAccess: ScopedAccessService,
    private readonly schoolCalendar: SchoolCalendarService,
  ) {}

  // Additive, mirroring AttendanceService.assertCanView: anyone holding
  // timetable.view can view any section; on top of that, a section's own
  // class teacher can view it without that broad permission.
  async assertCanView(tenantId: string, userId: string, sectionId: string): Promise<void> {
    if (await this.scopedAccess.hasPermission(userId, "timetable.view")) return;
    const staff = await this.scopedAccess.getActingStaff(tenantId, userId);
    if (staff && (await this.scopedAccess.isClassTeacherOfSection(staff.id, sectionId))) return;
    throw new ForbiddenException("not authorized to view this section's timetable");
  }

  async listPeriodSlots(tenantId: string, branchId: string, academicSessionId: string) {
    const slots = await this.prisma.periodSlot.findMany({
      where: { tenantId, branchId, academicSessionId, deletedAt: null },
      orderBy: { sortOrder: "asc" },
    });
    return slots.map(toPeriodSlot);
  }

  async createPeriodSlot(tenantId: string, actorUserId: string, dto: CreatePeriodSlotDto) {
    const now = new Date();
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.periodSlot.create({
        data: {
          id,
          tenantId,
          branchId: dto.branch_id,
          academicSessionId: dto.academic_session_id,
          name: dto.name,
          sortOrder: dto.sort_order,
          startTime: dto.start_time,
          endTime: dto.end_time,
          periodType: dto.period_type ?? "teaching",
          updatedAt: now,
          updatedBy: actorUserId,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "period_slots",
        entityId: id,
        action: "create",
        summary: `Added period slot '${dto.name}'`,
      });

      return toPeriodSlot(created);
    });
  }

  async updatePeriodSlot(tenantId: string, actorUserId: string, id: string, dto: UpdatePeriodSlotDto) {
    const existing = await this.prisma.periodSlot.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("period slot not found");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.periodSlot.update({
        where: { id },
        data: {
          name: dto.name,
          sortOrder: dto.sort_order,
          startTime: dto.start_time,
          endTime: dto.end_time,
          periodType: dto.period_type ?? existing.periodType,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: existing.branchId,
        actorUserId,
        entityTable: "period_slots",
        entityId: id,
        action: "update",
        summary: `Updated period slot '${dto.name}'`,
      });

      return toPeriodSlot(updated);
    });
  }

  // Blocked while any timetable entry still references this slot -- deleting
  // it out from under a saved timetable would silently orphan those rows.
  async deletePeriodSlot(tenantId: string, actorUserId: string, id: string) {
    const existing = await this.prisma.periodSlot.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("period slot not found");
    }

    const entryCount = await this.prisma.timetableEntry.count({ where: { periodSlotId: id, deletedAt: null } });
    if (entryCount > 0) {
      throw new BadRequestException("cannot delete a period slot that the timetable still uses");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.periodSlot.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: existing.branchId,
        actorUserId,
        entityTable: "period_slots",
        entityId: id,
        action: "delete",
        summary: `Deleted period slot '${existing.name}'`,
      });

      return toPeriodSlot(deleted);
    });
  }

  async getSectionTimetable(tenantId: string, sectionId: string, academicSessionId: string) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, tenantId, deletedAt: null },
      include: { class: true },
    });
    if (!section) {
      throw new NotFoundException("section not found");
    }
    const branchId = section.class.branchId;

    const [slots, entries, calendar] = await Promise.all([
      this.prisma.periodSlot.findMany({
        where: { tenantId, branchId, academicSessionId, deletedAt: null },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.timetableEntry.findMany({
        where: { tenantId, sectionId, academicSessionId, deletedAt: null },
        include: { subject: true, staff: true },
      }),
      this.schoolCalendar.getCalendar(tenantId, branchId, academicSessionId),
    ]);

    return {
      section_id: sectionId,
      class_id: section.classId,
      period_slots: slots.map(toPeriodSlot),
      entries: entries.map((e) => ({
        id: e.id,
        day_of_week: e.dayOfWeek,
        period_slot_id: e.periodSlotId,
        subject_id: e.subjectId,
        subject_name: e.subject.name,
        staff_id: e.staffId,
        staff_name: [e.staff.firstName, e.staff.lastName].filter(Boolean).join(" "),
        room_name: e.roomName,
      })),
      weekly_off_days: calendar.weekly_off_days,
      weekly_half_days: calendar.weekly_half_days,
    };
  }

  // Replaces a section's whole week in one transaction. Hard-blocks a
  // teacher double-booked at the same day+period in a *different* section
  // (checked both against existing rows and within the submitted batch
  // itself); soft-warns (doesn't block) when the assigned teacher has no
  // matching TeacherSubjectAssignment, since substitute/early-rollout
  // scenarios shouldn't be blocked outright.
  async saveSectionTimetable(tenantId: string, actorUserId: string, sectionId: string, dto: SaveSectionTimetableDto) {
    const section = await this.prisma.section.findFirst({ where: { id: sectionId, tenantId, deletedAt: null } });
    if (!section) {
      throw new NotFoundException("section not found");
    }

    const periodSlotIds = [...new Set(dto.entries.map((e) => e.period_slot_id))];
    const slots = await this.prisma.periodSlot.findMany({
      where: { id: { in: periodSlotIds }, tenantId, deletedAt: null },
    });
    const slotById = new Map(slots.map((s) => [s.id, s]));

    for (const entry of dto.entries) {
      const slot = slotById.get(entry.period_slot_id);
      if (!slot) {
        throw new BadRequestException("unknown period slot");
      }
      if (slot.periodType !== "teaching") {
        throw new BadRequestException("cannot assign a subject/teacher to a break or lunch period");
      }
    }

    // Hard validation: same-batch double-booking.
    const seenByStaffDayPeriod = new Map<string, boolean>();
    for (const entry of dto.entries) {
      const key = `${entry.staff_id}|${entry.day_of_week}|${entry.period_slot_id}`;
      if (seenByStaffDayPeriod.has(key)) {
        throw new BadRequestException("the same teacher is assigned twice at the same day and period in this save");
      }
      seenByStaffDayPeriod.set(key, true);
    }

    // Hard validation: double-booking against existing rows in other sections.
    const staffIds = [...new Set(dto.entries.map((e) => e.staff_id))];
    const conflicting = await this.prisma.timetableEntry.findMany({
      where: {
        tenantId,
        academicSessionId: dto.academic_session_id,
        staffId: { in: staffIds },
        sectionId: { not: sectionId },
        deletedAt: null,
      },
      include: { section: true },
    });
    for (const entry of dto.entries) {
      const clash = conflicting.find(
        (c) => c.staffId === entry.staff_id && c.dayOfWeek === entry.day_of_week && c.periodSlotId === entry.period_slot_id,
      );
      if (clash) {
        throw new BadRequestException(
          `teacher is already scheduled for section '${clash.section.name}' at this day/period`,
        );
      }
    }

    // Soft validation: teacher not formally assigned to teach this subject.
    const warnings: string[] = [];
    for (const entry of dto.entries) {
      const assigned = await this.scopedAccess.isAssignedToSubject(
        entry.staff_id,
        dto.class_id,
        entry.subject_id,
        dto.academic_session_id,
        sectionId,
      );
      if (!assigned) {
        warnings.push(
          `Teacher assigned to day ${entry.day_of_week}, period ${entry.period_slot_id} has no formal TeacherSubjectAssignment for this subject.`,
        );
      }
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.timetableEntry.updateMany({
        where: { tenantId, sectionId, academicSessionId: dto.academic_session_id, deletedAt: null },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      for (const entry of dto.entries) {
        await tx.timetableEntry.create({
          data: {
            id: randomUUID(),
            tenantId,
            branchId: dto.branch_id,
            academicSessionId: dto.academic_session_id,
            classId: dto.class_id,
            sectionId,
            dayOfWeek: entry.day_of_week,
            periodSlotId: entry.period_slot_id,
            subjectId: entry.subject_id,
            staffId: entry.staff_id,
            roomName: entry.room_name ?? null,
            updatedAt: now,
            updatedBy: actorUserId,
          },
        });
      }

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "timetable_entries",
        entityId: sectionId,
        action: "update",
        summary: `Saved timetable for section (${dto.entries.length} period(s))`,
      });
    });

    return { warnings };
  }

  async getStaffTimetable(tenantId: string, staffId: string, academicSessionId: string) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, tenantId, deletedAt: null } });
    if (!staff) {
      throw new NotFoundException("staff member not found");
    }

    const entries = await this.prisma.timetableEntry.findMany({
      where: { tenantId, staffId, academicSessionId, deletedAt: null },
      include: { subject: true, section: { include: { class: true } }, periodSlot: true },
      orderBy: [{ dayOfWeek: "asc" }, { periodSlot: { sortOrder: "asc" } }],
    });

    return entries.map((e) => ({
      id: e.id,
      day_of_week: e.dayOfWeek,
      period_slot_id: e.periodSlotId,
      period_name: e.periodSlot.name,
      start_time: e.periodSlot.startTime,
      end_time: e.periodSlot.endTime,
      class_id: e.section.classId,
      class_name: e.section.class.name,
      section_id: e.sectionId,
      section_name: e.section.name,
      subject_id: e.subjectId,
      subject_name: e.subject.name,
      room_name: e.roomName,
    }));
  }
}
