import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { CreateHolidayDto } from "./dto/create-holiday.dto.js";
import type { CreateHolidayRangeDto } from "./dto/create-holiday-range.dto.js";
import type { SetWeeklyRuleDto } from "./dto/set-weekly-rule.dto.js";
import type { UpdateHolidayDto } from "./dto/update-holiday.dto.js";

// "holiday" = no attendance/payroll impact at all. "half_day" = a
// school-defined shortened day (school-wide, e.g. every Saturday) -- still
// counts as a FULL working day for attendance/payroll purposes, since the
// school itself decided to run it. Distinct from a staff member's own
// attendance status of the same name, which means "this one person left
// early that day" and is handled separately.
export type DayType = "holiday" | "half_day" | "working";

// Weight of a calendar day toward working-days/payroll/attendance totals.
// Only an actual holiday reduces the total -- a school-defined half-day
// still counts as a full day.
export function dayWeight(type: DayType): number {
  return type === "holiday" ? 0 : 1;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface SchoolCalendarRow extends TenantRow {
  branch_id: string;
  academic_session_id: string;
  weekly_off_days: number[];
  weekly_half_days: number[];
}

export interface CalendarHolidayRow extends TenantRow {
  school_calendar_id: string;
  date: Date;
  name: string;
  type: string;
}

@Injectable()
export class SchoolCalendarService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  // Read-only -- never creates a row, so it's safe for any authenticated
  // user to call (no permission gate on the controller route).
  async getCalendar(tenantId: string, branchId: string, academicSessionId: string) {
    const calendar = await this.db.queryOne<SchoolCalendarRow>(
      tenantId,
      "SELECT * FROM school_calendars WHERE tenant_id = $1 AND branch_id = $2 AND academic_session_id = $3 AND deleted_at IS NULL",
      [tenantId, branchId, academicSessionId],
    );

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

    const holidays = await this.db.query<CalendarHolidayRow>(
      tenantId,
      "SELECT * FROM calendar_holidays WHERE tenant_id = $1 AND school_calendar_id = $2 AND deleted_at IS NULL ORDER BY date ASC",
      [tenantId, calendar.id],
    );

    return {
      id: calendar.id,
      branch_id: calendar.branch_id,
      academic_session_id: calendar.academic_session_id,
      weekly_off_days: calendar.weekly_off_days,
      weekly_half_days: calendar.weekly_half_days,
      holidays,
    };
  }

  // calendar_holidays itself carries no branch_id -- the branch check has to
  // go through its parent school_calendar instead, so a branch-scoped
  // caller can't reach another branch's holiday by id. Runs on the same
  // client/transaction as the caller so the subsequent update/delete stays
  // atomic with this check.
  private async findHolidayOrThrow(
    client: PoolClient,
    tenantId: string,
    id: string,
    branchId?: string | null,
  ): Promise<CalendarHolidayRow> {
    const conditions = ["h.id = $1", "h.tenant_id = $2", "h.deleted_at IS NULL"];
    const values: unknown[] = [id, tenantId];
    if (branchId) {
      values.push(branchId);
      conditions.push(`sc.branch_id = $${values.length}`);
    }
    const result = await client.query<CalendarHolidayRow>(
      `SELECT h.* FROM calendar_holidays h
       JOIN school_calendars sc ON sc.id = h.school_calendar_id
       WHERE ${conditions.join(" AND ")}`,
      values,
    );
    const holiday = result.rows[0];
    if (!holiday) {
      throw new NotFoundException("holiday not found");
    }
    return holiday;
  }

  private async getOrCreateCalendar(
    client: PoolClient,
    tenantId: string,
    actorUserId: string,
    branchId: string,
    academicSessionId: string,
  ): Promise<SchoolCalendarRow> {
    const existingResult = await client.query<SchoolCalendarRow>(
      "SELECT * FROM school_calendars WHERE tenant_id = $1 AND branch_id = $2 AND academic_session_id = $3 AND deleted_at IS NULL",
      [tenantId, branchId, academicSessionId],
    );
    const existing = existingResult.rows[0];
    if (existing) return existing;

    return insertRow<SchoolCalendarRow>(client, "school_calendars", tenantId, {
      branch_id: branchId,
      academic_session_id: academicSessionId,
      weekly_off_days: [],
      weekly_half_days: [],
      updated_at: new Date(),
      updated_by: actorUserId,
    });
  }

  async setWeeklyRule(tenantId: string, actorUserId: string, dto: SetWeeklyRuleDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const calendar = await this.getOrCreateCalendar(client, tenantId, actorUserId, dto.branch_id, dto.academic_session_id);

      const updated = await updateRow<SchoolCalendarRow>(client, "school_calendars", tenantId, calendar.id, {
        weekly_off_days: dto.weekly_off_days,
        weekly_half_days: dto.weekly_half_days,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
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
    return this.db.withTransaction(tenantId, async (client) => {
      const calendar = await this.getOrCreateCalendar(client, tenantId, actorUserId, dto.branch_id, dto.academic_session_id);

      const created = await insertRow<CalendarHolidayRow>(client, "calendar_holidays", tenantId, {
        school_calendar_id: calendar.id,
        date: new Date(dto.date),
        name: dto.name,
        type: dto.type,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "calendar_holidays",
        entityId: created.id,
        action: "create",
        summary: `Added ${dto.type === "holiday" ? "holiday" : "half-day"} '${dto.name}' on ${dto.date}`,
      });

      return created;
    });
  }

  // Same shape as addHoliday, but expands a start/end date span into one
  // calendar_holidays row per day -- e.g. summer/winter vacation -- rather
  // than making the caller add each date individually. A date already
  // named within the range is overwritten (same name/type), not duplicated,
  // since (school_calendar_id, date) is unique among non-deleted rows.
  async addHolidayRange(tenantId: string, actorUserId: string, dto: CreateHolidayRangeDto) {
    const start = new Date(dto.start_date);
    const end = new Date(dto.end_date);
    if (end < start) {
      throw new BadRequestException("end_date must be on or after start_date");
    }

    return this.db.withTransaction(tenantId, async (client) => {
      const calendar = await this.getOrCreateCalendar(client, tenantId, actorUserId, dto.branch_id, dto.academic_session_id);

      const existingResult = await client.query<CalendarHolidayRow>(
        "SELECT * FROM calendar_holidays WHERE tenant_id = $1 AND school_calendar_id = $2 AND deleted_at IS NULL AND date >= $3 AND date <= $4",
        [tenantId, calendar.id, start, end],
      );
      const existingByDate = new Map(existingResult.rows.map((h) => [toIsoDate(h.date), h]));

      let count = 0;
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = toIsoDate(d);
        const existing = existingByDate.get(iso);
        if (existing) {
          await updateRow<CalendarHolidayRow>(client, "calendar_holidays", tenantId, existing.id, {
            name: dto.name,
            type: dto.type,
            updated_at: new Date(),
            updated_by: actorUserId,
          });
        } else {
          await insertRow<CalendarHolidayRow>(client, "calendar_holidays", tenantId, {
            school_calendar_id: calendar.id,
            date: new Date(iso),
            name: dto.name,
            type: dto.type,
            updated_at: new Date(),
            updated_by: actorUserId,
          });
        }
        count++;
      }

      await this.audit.record(client, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "calendar_holidays",
        entityId: calendar.id,
        action: "create",
        summary: `Added ${dto.type === "holiday" ? "holiday" : "half-day"} range '${dto.name}' from ${dto.start_date} to ${dto.end_date} (${count} day${count === 1 ? "" : "s"})`,
      });

      return { count, start_date: dto.start_date, end_date: dto.end_date };
    });
  }

  async updateHoliday(tenantId: string, actorUserId: string, id: string, dto: UpdateHolidayDto, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      await this.findHolidayOrThrow(client, tenantId, id, branchId);

      const updated = await updateRow<CalendarHolidayRow>(client, "calendar_holidays", tenantId, id, {
        date: new Date(dto.date),
        name: dto.name,
        type: dto.type,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
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

  async deleteHoliday(tenantId: string, actorUserId: string, id: string, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await this.findHolidayOrThrow(client, tenantId, id, branchId);

      const deleted = await updateRow<CalendarHolidayRow>(client, "calendar_holidays", tenantId, id, {
        deleted_at: new Date(),
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
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

    const calendars = await this.db.query<
      SchoolCalendarRow & { session_start_date: Date; session_end_date: Date }
    >(
      tenantId,
      `SELECT sc.*, s.start_date AS session_start_date, s.end_date AS session_end_date
       FROM school_calendars sc
       JOIN academic_sessions s ON s.id = sc.academic_session_id
       WHERE sc.tenant_id = $1 AND sc.branch_id = $2 AND sc.deleted_at IS NULL`,
      [tenantId, branchId],
    );

    const holidaysByCalendar = new Map<string, CalendarHolidayRow[]>();
    if (calendars.length > 0) {
      const holidayRows = await this.db.query<CalendarHolidayRow>(
        tenantId,
        `SELECT * FROM calendar_holidays
         WHERE tenant_id = $1 AND school_calendar_id = ANY($2) AND deleted_at IS NULL AND date >= $3 AND date <= $4`,
        [tenantId, calendars.map((c) => c.id), start, end],
      );
      for (const h of holidayRows) {
        const list = holidaysByCalendar.get(h.school_calendar_id) ?? [];
        list.push(h);
        holidaysByCalendar.set(h.school_calendar_id, list);
      }
    }

    const result: Record<string, DayType> = {};

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = toIsoDate(d);
      const calendar = calendars.find((c) => d >= c.session_start_date && d <= c.session_end_date);

      if (!calendar) {
        result[iso] = "working";
        continue;
      }

      const holidays = holidaysByCalendar.get(calendar.id) ?? [];
      const override = holidays.find((h) => toIsoDate(h.date) === iso);
      if (override) {
        result[iso] = override.type as DayType;
        continue;
      }

      const dayOfWeek = d.getUTCDay();
      if (calendar.weekly_off_days.includes(dayOfWeek)) {
        result[iso] = "holiday";
      } else if (calendar.weekly_half_days.includes(dayOfWeek)) {
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
