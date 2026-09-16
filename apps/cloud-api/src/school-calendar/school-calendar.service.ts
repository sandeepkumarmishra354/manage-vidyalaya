import { randomUUID } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateHolidayDto } from "./dto/create-holiday.dto.js";
import type { SetWeeklyRuleDto } from "./dto/set-weekly-rule.dto.js";
import type { UpdateHolidayDto } from "./dto/update-holiday.dto.js";

// "holiday" = no attendance/payroll impact at all. "half_day" = counts as
// half a working day for everyone (school-wide, e.g. every Saturday) --
// distinct from a staff member's own attendance status of the same name,
// which means "this one person left early that day."
export type DayType = "holiday" | "half_day" | "working";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class SchoolCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Read-only -- never creates a row, so it's safe for any authenticated
  // user to call (no permission gate on the controller route).
  async getCalendar(tenantId: string, branchId: string, academicSessionId: string) {
    const calendar = await this.prisma.schoolCalendar.findFirst({
      where: { tenantId, branchId, academicSessionId, deletedAt: null },
      include: { holidays: { where: { deletedAt: null }, orderBy: { date: "asc" } } },
    });

    if (!calendar) {
      return {
        id: null,
        branch_id: branchId,
        academic_session_id: academicSessionId,
        weekly_off_days: [] as number[],
        weekly_half_days: [] as number[],
        holidays: [] as { id: string; date: Date; name: string; type: string }[],
      };
    }

    return {
      id: calendar.id,
      branch_id: calendar.branchId,
      academic_session_id: calendar.academicSessionId,
      weekly_off_days: calendar.weeklyOffDays,
      weekly_half_days: calendar.weeklyHalfDays,
      holidays: calendar.holidays,
    };
  }

  private async getOrCreateCalendar(
    tenantId: string,
    actorUserId: string,
    branchId: string,
    academicSessionId: string,
  ) {
    const existing = await this.prisma.schoolCalendar.findFirst({
      where: { tenantId, branchId, academicSessionId, deletedAt: null },
    });
    if (existing) return existing;

    const now = new Date();
    return this.prisma.schoolCalendar.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId,
        academicSessionId,
        weeklyOffDays: [],
        weeklyHalfDays: [],
        updatedAt: now,
        updatedBy: actorUserId,
      },
    });
  }

  async setWeeklyRule(tenantId: string, actorUserId: string, dto: SetWeeklyRuleDto) {
    const calendar = await this.getOrCreateCalendar(tenantId, actorUserId, dto.branch_id, dto.academic_session_id);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.schoolCalendar.update({
        where: { id: calendar.id },
        data: {
          weeklyOffDays: dto.weekly_off_days,
          weeklyHalfDays: dto.weekly_half_days,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "school_calendars",
        entityId: updated.id,
        action: "update",
        summary: "Updated weekly attendance rule",
      });

      return updated;
    });
  }

  async addHoliday(tenantId: string, actorUserId: string, dto: CreateHolidayDto) {
    const calendar = await this.getOrCreateCalendar(tenantId, actorUserId, dto.branch_id, dto.academic_session_id);
    const now = new Date();
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.calendarHoliday.create({
        data: {
          id,
          tenantId,
          schoolCalendarId: calendar.id,
          date: new Date(dto.date),
          name: dto.name,
          type: dto.type,
          updatedAt: now,
          updatedBy: actorUserId,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "calendar_holidays",
        entityId: id,
        action: "create",
        summary: `Added ${dto.type === "holiday" ? "holiday" : "half-day"} '${dto.name}' on ${dto.date}`,
      });

      return created;
    });
  }

  async updateHoliday(tenantId: string, actorUserId: string, id: string, dto: UpdateHolidayDto) {
    const existing = await this.prisma.calendarHoliday.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("holiday not found");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.calendarHoliday.update({
        where: { id },
        data: {
          date: new Date(dto.date),
          name: dto.name,
          type: dto.type,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "calendar_holidays",
        entityId: id,
        action: "update",
        summary: `Updated holiday '${dto.name}'`,
      });

      return updated;
    });
  }

  async deleteHoliday(tenantId: string, actorUserId: string, id: string) {
    const existing = await this.prisma.calendarHoliday.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("holiday not found");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.calendarHoliday.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "calendar_holidays",
        entityId: id,
        action: "delete",
        summary: `Removed holiday '${existing.name}'`,
      });

      return deleted;
    });
  }

  // The single source of truth for "what kind of day is this" -- a dated
  // CalendarHoliday override always wins; otherwise falls back to the
  // weekly rule of whichever academic session's calendar the date falls
  // in. A date with no matching calendar at all (nothing configured yet)
  // defaults to "working" -- no calendar means no restrictions.
  async getDayTypesInRange(
    tenantId: string,
    branchId: string,
    startDate: string,
    endDate: string,
  ): Promise<Record<string, DayType>> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const calendars = await this.prisma.schoolCalendar.findMany({
      where: { tenantId, branchId, deletedAt: null },
      include: {
        academicSession: true,
        holidays: { where: { deletedAt: null, date: { gte: start, lte: end } } },
      },
    });

    const result: Record<string, DayType> = {};

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = toIsoDate(d);
      const calendar = calendars.find((c) => d >= c.academicSession.startDate && d <= c.academicSession.endDate);

      if (!calendar) {
        result[iso] = "working";
        continue;
      }

      const override = calendar.holidays.find((h) => toIsoDate(h.date) === iso);
      if (override) {
        result[iso] = override.type as DayType;
        continue;
      }

      const dayOfWeek = d.getUTCDay();
      if (calendar.weeklyOffDays.includes(dayOfWeek)) {
        result[iso] = "holiday";
      } else if (calendar.weeklyHalfDays.includes(dayOfWeek)) {
        result[iso] = "half_day";
      } else {
        result[iso] = "working";
      }
    }

    return result;
  }

  async getDayType(tenantId: string, branchId: string, date: string): Promise<DayType> {
    const map = await this.getDayTypesInRange(tenantId, branchId, date, date);
    return map[date] ?? "working";
  }
}
