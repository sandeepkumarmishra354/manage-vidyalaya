import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { ScopedAccessService } from "../common/scoped-access.service.js";
import { DbService } from "../db/db.service.js";
import { isUniqueViolation } from "../db/pg-errors.js";
import { findOneForTenant, insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import { SchoolCalendarService } from "../school-calendar/school-calendar.service.js";
import type { CreatePeriodSlotDto } from "./dto/create-period-slot.dto.js";
import type { SaveSectionTimetableDto } from "./dto/save-section-timetable.dto.js";
import type { UpdatePeriodSlotDto } from "./dto/update-period-slot.dto.js";

// Same convention as MAX_ADMISSION_NUMBER_ATTEMPTS in students.service.ts.
const MAX_PERIOD_SLOT_SORT_ORDER_ATTEMPTS = 20;

export interface PeriodSlotRow extends TenantRow {
  branch_id: string;
  academic_session_id: string;
  name: string;
  sort_order: number;
  start_time: string;
  end_time: string;
  period_type: string;
}

interface TimetableEntryRow extends TenantRow {
  branch_id: string;
  academic_session_id: string;
  class_id: string;
  section_id: string;
  day_of_week: number;
  period_slot_id: string;
  subject_id: string;
  staff_id: string;
  room_name: string | null;
}

function toPeriodSlot(p: PeriodSlotRow) {
  return {
    id: p.id,
    branch_id: p.branch_id,
    academic_session_id: p.academic_session_id,
    name: p.name,
    sort_order: p.sort_order,
    start_time: p.start_time,
    end_time: p.end_time,
    period_type: p.period_type,
  };
}

@Injectable()
export class TimetableService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly scopedAccess: ScopedAccessService,
    private readonly schoolCalendar: SchoolCalendarService,
  ) {}

  // Additive, mirroring AttendanceService.assertCanView: anyone holding
  // timetable.view can view any section; on top of that, a section's own
  // class teacher can view it without that broad permission.
  async assertCanView(tenantId: string, userId: string, sectionId: string): Promise<void> {
    if (await this.scopedAccess.hasPermission(tenantId, userId, "timetable.view")) return;
    const staff = await this.scopedAccess.getActingStaff(tenantId, userId);
    if (staff && (await this.scopedAccess.isClassTeacherOfSection(tenantId, staff.id, sectionId))) return;
    throw new ForbiddenException("not authorized to view this section's timetable");
  }

  async listPeriodSlots(tenantId: string, branchId: string, academicSessionId: string) {
    const slots = await this.db.query<PeriodSlotRow>(
      tenantId,
      "SELECT * FROM period_slots WHERE tenant_id = $1 AND branch_id = $2 AND academic_session_id = $3 AND deleted_at IS NULL ORDER BY sort_order ASC",
      [tenantId, branchId, academicSessionId],
    );
    return slots.map(toPeriodSlot);
  }

  // Same "count, attempt, retry-on-clash" scheme as
  // StudentsService.confirmAdmission's admissionNumber assignment -- the
  // server derives sort_order itself rather than trusting a client-computed
  // value, so it can't collide from a stale client-side count (a rapid
  // second "Add" before the list refresh lands) or from a soft-deleted
  // slot that's still occupying its old value in the unique
  // (branch_id, academic_session_id, sort_order) index.
  async createPeriodSlot(tenantId: string, actorUserId: string, dto: CreatePeriodSlotDto) {
    const now = new Date();

    const countRow = await this.db.queryOne<{ count: string }>(
      tenantId,
      "SELECT COUNT(*)::text AS count FROM period_slots WHERE tenant_id = $1 AND branch_id = $2 AND academic_session_id = $3 AND deleted_at IS NULL",
      [tenantId, dto.branch_id, dto.academic_session_id],
    );
    let sortOrder = Number(countRow?.count ?? "0");
    let created: PeriodSlotRow | undefined;

    // Each attempt runs in its own transaction (rather than one shared
    // transaction across the whole loop) -- a unique-constraint violation
    // aborts whatever transaction it happened in, and Postgres refuses any
    // further statement on that same transaction until it's rolled back, so
    // retrying on the same connection/transaction would fail every
    // subsequent attempt with "current transaction is aborted" instead of
    // actually retrying. This also matches the original Prisma version,
    // where each create() call was its own separate implicit transaction.
    for (let attempt = 1; attempt <= MAX_PERIOD_SLOT_SORT_ORDER_ATTEMPTS; attempt++) {
      try {
        created = await this.db.withTransaction(tenantId, (client) =>
          insertRow<PeriodSlotRow>(client, "period_slots", tenantId, {
            branch_id: dto.branch_id,
            academic_session_id: dto.academic_session_id,
            name: dto.name,
            sort_order: sortOrder,
            start_time: dto.start_time,
            end_time: dto.end_time,
            period_type: dto.period_type ?? "teaching",
            updated_at: now,
            updated_by: actorUserId,
          }),
        );
        break;
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        // Keep retrying with the next value, including on the final attempt --
        // falling out of the loop here (rather than re-throwing the raw
        // error) lets the ConflictException below actually surface
        // instead of a raw constraint-violation message.
        sortOrder += 1;
      }
    }

    if (!created) {
      throw new ConflictException("could not allocate a period slot order, please retry");
    }

    await this.db.withTransaction(tenantId, (client) =>
      this.audit.record(client, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "period_slots",
        entityId: created!.id,
        action: "create",
        summary: `Added period slot '${dto.name}'`,
      }),
    );

    return toPeriodSlot(created);
  }

  async updatePeriodSlot(tenantId: string, actorUserId: string, id: string, dto: UpdatePeriodSlotDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<PeriodSlotRow>(client, "period_slots", tenantId, id);
      if (!existing) {
        throw new NotFoundException("period slot not found");
      }

      const updated = await updateRow<PeriodSlotRow>(client, "period_slots", tenantId, id, {
        name: dto.name,
        sort_order: dto.sort_order,
        start_time: dto.start_time,
        end_time: dto.end_time,
        period_type: dto.period_type ?? existing.period_type,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: existing.branch_id,
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
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<PeriodSlotRow>(client, "period_slots", tenantId, id);
      if (!existing) {
        throw new NotFoundException("period slot not found");
      }

      const entryCountResult = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM timetable_entries WHERE tenant_id = $1 AND period_slot_id = $2 AND deleted_at IS NULL",
        [tenantId, id],
      );
      if (Number(entryCountResult.rows[0]?.count ?? "0") > 0) {
        throw new BadRequestException("cannot delete a period slot that the timetable still uses");
      }

      const deleted = await updateRow<PeriodSlotRow>(client, "period_slots", tenantId, id, {
        deleted_at: new Date(),
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: existing.branch_id,
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
    const section = await this.db.queryOne<{ id: string; class_id: string; branch_id: string }>(
      tenantId,
      `SELECT sec.id, sec.class_id, c.branch_id
       FROM sections sec
       JOIN classes c ON c.id = sec.class_id
       WHERE sec.id = $1 AND sec.tenant_id = $2 AND sec.deleted_at IS NULL`,
      [sectionId, tenantId],
    );
    if (!section) {
      throw new NotFoundException("section not found");
    }
    const branchId = section.branch_id;

    const [slots, entries, calendar] = await Promise.all([
      this.db.query<PeriodSlotRow>(
        tenantId,
        "SELECT * FROM period_slots WHERE tenant_id = $1 AND branch_id = $2 AND academic_session_id = $3 AND deleted_at IS NULL ORDER BY sort_order ASC",
        [tenantId, branchId, academicSessionId],
      ),
      this.db.query<
        TimetableEntryRow & { subject_name: string; first_name: string; last_name: string | null }
      >(
        tenantId,
        `SELECT te.*, sub.name AS subject_name, st.first_name, st.last_name
         FROM timetable_entries te
         JOIN subjects sub ON sub.id = te.subject_id
         JOIN staff st ON st.id = te.staff_id
         WHERE te.tenant_id = $1 AND te.section_id = $2 AND te.academic_session_id = $3 AND te.deleted_at IS NULL`,
        [tenantId, sectionId, academicSessionId],
      ),
      this.schoolCalendar.getCalendar(tenantId, branchId, academicSessionId),
    ]);

    return {
      section_id: sectionId,
      class_id: section.class_id,
      period_slots: slots.map(toPeriodSlot),
      entries: entries.map((e) => ({
        id: e.id,
        day_of_week: e.day_of_week,
        period_slot_id: e.period_slot_id,
        subject_id: e.subject_id,
        subject_name: e.subject_name,
        staff_id: e.staff_id,
        staff_name: [e.first_name, e.last_name].filter(Boolean).join(" "),
        room_name: e.room_name,
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
    const section = await this.db.queryOne<{ id: string }>(
      tenantId,
      "SELECT id FROM sections WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL",
      [sectionId, tenantId],
    );
    if (!section) {
      throw new NotFoundException("section not found");
    }

    const periodSlotIds = [...new Set(dto.entries.map((e) => e.period_slot_id))];
    const slots =
      periodSlotIds.length > 0
        ? await this.db.query<PeriodSlotRow>(
            tenantId,
            "SELECT * FROM period_slots WHERE id = ANY($1) AND tenant_id = $2 AND deleted_at IS NULL",
            [periodSlotIds, tenantId],
          )
        : [];
    const slotById = new Map(slots.map((s) => [s.id, s]));

    for (const entry of dto.entries) {
      const slot = slotById.get(entry.period_slot_id);
      if (!slot) {
        throw new BadRequestException("unknown period slot");
      }
      if (slot.period_type !== "teaching") {
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
    const conflicting =
      staffIds.length > 0
        ? await this.db.query<{ staff_id: string; day_of_week: number; period_slot_id: string; section_name: string }>(
            tenantId,
            `SELECT te.staff_id, te.day_of_week, te.period_slot_id, sec.name AS section_name
             FROM timetable_entries te
             JOIN sections sec ON sec.id = te.section_id
             WHERE te.tenant_id = $1 AND te.academic_session_id = $2 AND te.staff_id = ANY($3)
               AND te.section_id != $4 AND te.deleted_at IS NULL`,
            [tenantId, dto.academic_session_id, staffIds, sectionId],
          )
        : [];
    for (const entry of dto.entries) {
      const clash = conflicting.find(
        (c) => c.staff_id === entry.staff_id && c.day_of_week === entry.day_of_week && c.period_slot_id === entry.period_slot_id,
      );
      if (clash) {
        throw new BadRequestException(
          `teacher is already scheduled for section '${clash.section_name}' at this day/period`,
        );
      }
    }

    // Soft validation: teacher not formally assigned to teach this subject.
    const warnings: string[] = [];
    for (const entry of dto.entries) {
      const assigned = await this.scopedAccess.isAssignedToSubject(
        tenantId,
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

    await this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();

      await client.query(
        "UPDATE timetable_entries SET deleted_at = $1, updated_at = $1, updated_by = $2, version = version + 1 WHERE tenant_id = $3 AND section_id = $4 AND academic_session_id = $5 AND deleted_at IS NULL",
        [now, actorUserId, tenantId, sectionId, dto.academic_session_id],
      );

      for (const entry of dto.entries) {
        await insertRow<TimetableEntryRow>(client, "timetable_entries", tenantId, {
          branch_id: dto.branch_id,
          academic_session_id: dto.academic_session_id,
          class_id: dto.class_id,
          section_id: sectionId,
          day_of_week: entry.day_of_week,
          period_slot_id: entry.period_slot_id,
          subject_id: entry.subject_id,
          staff_id: entry.staff_id,
          room_name: entry.room_name ?? null,
          updated_at: now,
          updated_by: actorUserId,
        });
      }

      await this.audit.record(client, {
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
    const staff = await this.db.queryOne<{ id: string }>(
      tenantId,
      "SELECT id FROM staff WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL",
      [staffId, tenantId],
    );
    if (!staff) {
      throw new NotFoundException("staff member not found");
    }

    const entries = await this.db.query<{
      id: string;
      day_of_week: number;
      period_slot_id: string;
      period_name: string;
      start_time: string;
      end_time: string;
      class_id: string;
      class_name: string;
      section_id: string;
      section_name: string;
      subject_id: string;
      subject_name: string;
      room_name: string | null;
    }>(
      tenantId,
      `SELECT te.id, te.day_of_week, te.period_slot_id, ps.name AS period_name, ps.start_time, ps.end_time,
              sec.class_id, c.name AS class_name, te.section_id, sec.name AS section_name,
              te.subject_id, sub.name AS subject_name, te.room_name
       FROM timetable_entries te
       JOIN period_slots ps ON ps.id = te.period_slot_id
       JOIN sections sec ON sec.id = te.section_id
       JOIN classes c ON c.id = sec.class_id
       JOIN subjects sub ON sub.id = te.subject_id
       WHERE te.tenant_id = $1 AND te.staff_id = $2 AND te.academic_session_id = $3 AND te.deleted_at IS NULL
       ORDER BY te.day_of_week ASC, ps.sort_order ASC`,
      [tenantId, staffId, academicSessionId],
    );

    return entries.map((e) => ({
      id: e.id,
      day_of_week: e.day_of_week,
      period_slot_id: e.period_slot_id,
      period_name: e.period_name,
      start_time: e.start_time,
      end_time: e.end_time,
      class_id: e.class_id,
      class_name: e.class_name,
      section_id: e.section_id,
      section_name: e.section_name,
      subject_id: e.subject_id,
      subject_name: e.subject_name,
      room_name: e.room_name,
    }));
  }
}
