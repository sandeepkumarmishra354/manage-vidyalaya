import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { AssignHouseDto } from "./dto/assign-house.dto.js";
import type { AwardPointsDto } from "./dto/award-points.dto.js";
import type { CreateHouseDto } from "./dto/create-house.dto.js";
import type { UpdateHouseDto } from "./dto/update-house.dto.js";

export interface HouseRow extends TenantRow {
  branch_id: string;
  name: string;
  color: string | null;
}

export interface StudentHouseRow extends TenantRow {
  student_id: string;
  house_id: string;
}

@Injectable()
export class HousesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async createHouse(tenantId: string, dto: CreateHouseDto) {
    return this.db.withTransaction(tenantId, (client) =>
      insertRow<HouseRow>(client, "houses", tenantId, {
        branch_id: dto.branch_id,
        name: dto.name,
        color: dto.color ?? null,
        updated_at: new Date(),
      }),
    );
  }

  async updateHouse(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateHouseDto,
    branchId?: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<HouseRow>(
        client,
        "houses",
        tenantId,
        id,
        {
          name: dto.name,
          color: dto.color ?? null,
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "houses",
        entityId: id,
        action: "update",
        summary: `Renamed house to '${dto.name}'`,
      });

      return updated;
    });
  }

  listHouses(tenantId: string, branchId: string) {
    return this.db.query<HouseRow>(
      tenantId,
      "SELECT * FROM houses WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL ORDER BY name ASC",
      [tenantId, branchId],
    );
  }

  // Assigns a student to a house, replacing any previous assignment (a
  // student has at most one house at a time) -- studentId is globally
  // unique on this table, matching the Prisma-era schema.
  async assignStudentHouse(tenantId: string, actorUserId: string, dto: AssignHouseDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      const result = await client.query<StudentHouseRow>(
        `INSERT INTO student_houses (id, tenant_id, student_id, house_id, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (student_id) DO UPDATE SET
           house_id = EXCLUDED.house_id, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by,
           deleted_at = NULL, version = student_houses.version + 1
         RETURNING *`,
        [randomUUID(), tenantId, dto.student_id, dto.house_id, now, actorUserId],
      );
      return result.rows[0];
    });
  }

  // branchId (when the caller is branch-scoped): the student's house is
  // only returned when it belongs to the caller's own branch -- a house in
  // another branch comes back as null, same as no house assigned at all,
  // rather than leaking that it exists elsewhere.
  async getStudentHouse(tenantId: string, studentId: string, branchId?: string | null) {
    const values: unknown[] = [tenantId, studentId];
    let branchCondition = "";
    if (branchId) {
      values.push(branchId);
      branchCondition = `AND h.branch_id = $${values.length}`;
    }
    return this.db.queryOne<HouseRow>(
      tenantId,
      `SELECT h.* FROM student_houses sh
       JOIN houses h ON h.id = sh.house_id
       WHERE sh.tenant_id = $1 AND sh.student_id = $2 AND sh.deleted_at IS NULL AND h.deleted_at IS NULL ${branchCondition}`,
      values,
    );
  }

  async awardHousePoints(tenantId: string, dto: AwardPointsDto) {
    return this.db.withTransaction(tenantId, (client) =>
      insertRow(client, "house_point_events", tenantId, {
        branch_id: dto.branch_id,
        house_id: dto.house_id,
        student_id: dto.student_id ?? null,
        academic_session_id: dto.academic_session_id ?? null,
        points: dto.points,
        reason: dto.reason,
        event_date: new Date(dto.event_date),
        updated_at: new Date(),
      }),
    );
  }

  async listHousePointEvents(tenantId: string, branchId: string) {
    const rows = await this.db.query<{
      id: string;
      house_name: string;
      first_name: string | null;
      last_name: string | null;
      points: number;
      reason: string;
      event_date: Date;
    }>(
      tenantId,
      `SELECT hpe.id, h.name AS house_name, s.first_name, s.last_name, hpe.points, hpe.reason, hpe.event_date
       FROM house_point_events hpe
       JOIN houses h ON h.id = hpe.house_id
       LEFT JOIN students s ON s.id = hpe.student_id
       WHERE hpe.tenant_id = $1 AND hpe.branch_id = $2 AND hpe.deleted_at IS NULL
       ORDER BY hpe.event_date DESC
       LIMIT 200`,
      [tenantId, branchId],
    );

    return rows.map((e) => ({
      id: e.id,
      house_name: e.house_name,
      student_name: e.first_name ? [e.first_name, e.last_name].filter(Boolean).join(" ") : null,
      points: e.points,
      reason: e.reason,
      event_date: e.event_date,
    }));
  }

  async getHouseLeaderboard(tenantId: string, branchId: string, academicSessionId?: string) {
    const values: unknown[] = [tenantId, branchId];
    let sessionCondition = "";
    if (academicSessionId) {
      values.push(academicSessionId);
      sessionCondition = `AND hpe.academic_session_id = $${values.length}`;
    }

    const rows = await this.db.query<{
      house_id: string;
      house_name: string;
      color: string | null;
      total_points: string | null;
      student_count: string;
    }>(
      tenantId,
      `SELECT h.id AS house_id, h.name AS house_name, h.color,
              (SELECT COALESCE(SUM(hpe.points), 0) FROM house_point_events hpe
                WHERE hpe.house_id = h.id AND hpe.tenant_id = $1 AND hpe.deleted_at IS NULL ${sessionCondition}) AS total_points,
              (SELECT COUNT(*) FROM student_houses sh
                WHERE sh.house_id = h.id AND sh.tenant_id = $1 AND sh.deleted_at IS NULL) AS student_count
       FROM houses h
       WHERE h.tenant_id = $1 AND h.branch_id = $2 AND h.deleted_at IS NULL`,
      values,
    );

    return rows
      .map((r) => ({
        house_id: r.house_id,
        house_name: r.house_name,
        color: r.color,
        total_points: Number(r.total_points ?? 0),
        student_count: Number(r.student_count),
      }))
      .sort((a, b) => b.total_points - a.total_points);
  }
}
