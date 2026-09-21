import { randomUUID } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { findOneForTenant, insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { AssignTransportDto } from "./dto/assign-transport.dto.js";
import type { CreateRouteDto } from "./dto/create-route.dto.js";
import type { CreateStopDto } from "./dto/create-stop.dto.js";
import type { UpdateRouteDto } from "./dto/update-route.dto.js";
import type { UpdateStopDto } from "./dto/update-stop.dto.js";

export interface TransportRouteRow extends TenantRow {
  branch_id: string;
  name: string;
  vehicle_number: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  capacity: number | null;
}

export interface TransportStopRow extends TenantRow {
  route_id: string;
  name: string;
  sequence: number;
  pickup_time: string | null;
}

export interface StudentTransportRow extends TenantRow {
  student_id: string;
  route_id: string;
  stop_id: string;
}

@Injectable()
export class TransportService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async createRoute(tenantId: string, dto: CreateRouteDto) {
    return this.db.withTransaction(tenantId, (client) =>
      insertRow<TransportRouteRow>(client, "transport_routes", tenantId, {
        branch_id: dto.branch_id,
        name: dto.name,
        vehicle_number: dto.vehicle_number ?? null,
        driver_name: dto.driver_name ?? null,
        driver_phone: dto.driver_phone ?? null,
        capacity: dto.capacity ?? null,
        updated_at: new Date(),
      }),
    );
  }

  async updateRoute(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateRouteDto,
    branchId?: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<TransportRouteRow>(
        client,
        "transport_routes",
        tenantId,
        id,
        {
          name: dto.name,
          vehicle_number: dto.vehicle_number ?? null,
          driver_name: dto.driver_name ?? null,
          driver_phone: dto.driver_phone ?? null,
          capacity: dto.capacity ?? null,
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "transport_routes",
        entityId: id,
        action: "update",
        summary: `Updated route '${dto.name}'`,
      });

      return updated;
    });
  }

  listRoutes(tenantId: string, branchId: string) {
    return this.db.query<TransportRouteRow>(
      tenantId,
      "SELECT * FROM transport_routes WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL ORDER BY name ASC",
      [tenantId, branchId],
    );
  }

  async createStop(tenantId: string, dto: CreateStopDto) {
    return this.db.withTransaction(tenantId, (client) =>
      insertRow<TransportStopRow>(client, "transport_stops", tenantId, {
        route_id: dto.route_id,
        name: dto.name,
        sequence: dto.sequence ?? 0,
        pickup_time: dto.pickup_time ?? null,
        updated_at: new Date(),
      }),
    );
  }

  // transport_stops itself has no branch_id column -- it's scoped through
  // its parent route instead: when the caller is branch-scoped, we look the
  // stop's route up first and 404 (rather than leak that the stop exists)
  // if that route isn't in the caller's own branch.
  async updateStop(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateStopDto,
    branchId?: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      if (branchId) {
        const stop = await findOneForTenant<TransportStopRow>(client, "transport_stops", tenantId, id);
        if (!stop) {
          throw new NotFoundException(`transport_stops row ${id} not found`);
        }
        const route = await findOneForTenant<TransportRouteRow>(
          client,
          "transport_routes",
          tenantId,
          stop.route_id,
          branchId,
        );
        if (!route) {
          throw new NotFoundException(`transport_stops row ${id} not found`);
        }
      }

      const updated = await updateRow<TransportStopRow>(client, "transport_stops", tenantId, id, {
        name: dto.name,
        sequence: dto.sequence ?? 0,
        pickup_time: dto.pickup_time ?? null,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "transport_stops",
        entityId: id,
        action: "update",
        summary: `Updated stop '${dto.name}'`,
      });

      return updated;
    });
  }

  // branchId: when the caller is branch-scoped, a route_id belonging to
  // another branch quietly yields no stops (like a route_id that doesn't
  // exist at all) rather than leaking that route's stops.
  async listStops(tenantId: string, routeId: string, branchId?: string | null) {
    if (branchId) {
      const route = await this.db.queryOne<TransportRouteRow>(
        tenantId,
        "SELECT * FROM transport_routes WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 AND deleted_at IS NULL",
        [routeId, tenantId, branchId],
      );
      if (!route) {
        return [];
      }
    }
    return this.db.query<TransportStopRow>(
      tenantId,
      "SELECT * FROM transport_stops WHERE tenant_id = $1 AND route_id = $2 AND deleted_at IS NULL ORDER BY sequence ASC",
      [tenantId, routeId],
    );
  }

  // Assigns a student to a route/stop, replacing any previous assignment.
  // studentId is globally unique on this table (matches the Prisma-era
  // schema) -- ON CONFLICT resets deleted_at, so re-assigning a student
  // whose prior assignment was ever soft-deleted becomes visible again.
  async assignStudentTransport(tenantId: string, actorUserId: string, dto: AssignTransportDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      const result = await client.query<StudentTransportRow>(
        `INSERT INTO student_transport (id, tenant_id, student_id, route_id, stop_id, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (student_id) DO UPDATE SET
           route_id = EXCLUDED.route_id, stop_id = EXCLUDED.stop_id, updated_at = EXCLUDED.updated_at,
           updated_by = EXCLUDED.updated_by, deleted_at = NULL, version = student_transport.version + 1
         RETURNING *`,
        [randomUUID(), tenantId, dto.student_id, dto.route_id, dto.stop_id, now, actorUserId],
      );
      const assignment = result.rows[0];

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "student_transport",
        entityId: assignment.id,
        action: "update",
        summary: "Assigned student transport route/stop",
      });

      return assignment;
    });
  }

  // branchId: the join includes transport_routes (branch-scoped), so a
  // student whose assigned route belongs to another branch comes back as
  // null, same as "not assigned to transport at all".
  async getStudentTransport(tenantId: string, studentId: string, branchId?: string | null) {
    const values: unknown[] = [tenantId, studentId];
    let branchCondition = "";
    if (branchId) {
      values.push(branchId);
      branchCondition = `AND r.branch_id = $${values.length}`;
    }
    return this.db.queryOne<{ route_name: string; stop_name: string; pickup_time: string | null }>(
      tenantId,
      `SELECT r.name AS route_name, s.name AS stop_name, s.pickup_time
       FROM student_transport st
       JOIN transport_routes r ON r.id = st.route_id
       JOIN transport_stops s ON s.id = st.stop_id
       WHERE st.tenant_id = $1 AND st.student_id = $2 AND st.deleted_at IS NULL ${branchCondition}`,
      values,
    );
  }

  // branchId: a route_id belonging to another branch quietly yields an
  // empty roster rather than leaking that route's students.
  async listRouteRoster(tenantId: string, routeId: string, branchId?: string | null) {
    if (branchId) {
      const route = await this.db.queryOne<TransportRouteRow>(
        tenantId,
        "SELECT * FROM transport_routes WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 AND deleted_at IS NULL",
        [routeId, tenantId, branchId],
      );
      if (!route) {
        return [];
      }
    }

    const rows = await this.db.query<{
      student_id: string;
      first_name: string;
      last_name: string | null;
      stop_name: string;
    }>(
      tenantId,
      `SELECT st.student_id, s.first_name, s.last_name, stp.name AS stop_name
       FROM student_transport st
       JOIN students s ON s.id = st.student_id
       JOIN transport_stops stp ON stp.id = st.stop_id
       WHERE st.tenant_id = $1 AND st.route_id = $2 AND st.deleted_at IS NULL AND s.deleted_at IS NULL
       ORDER BY stp.sequence ASC, s.first_name ASC`,
      [tenantId, routeId],
    );

    return rows.map((a) => ({
      student_id: a.student_id,
      first_name: a.first_name,
      last_name: a.last_name,
      stop_name: a.stop_name,
    }));
  }
}
