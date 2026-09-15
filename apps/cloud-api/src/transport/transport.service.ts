import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AssignTransportDto } from "./dto/assign-transport.dto.js";
import type { CreateRouteDto } from "./dto/create-route.dto.js";
import type { CreateStopDto } from "./dto/create-stop.dto.js";
import type { UpdateRouteDto } from "./dto/update-route.dto.js";
import type { UpdateStopDto } from "./dto/update-stop.dto.js";

@Injectable()
export class TransportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createRoute(tenantId: string, dto: CreateRouteDto) {
    return this.prisma.transportRoute.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: dto.branch_id,
        name: dto.name,
        vehicleNumber: dto.vehicle_number ?? null,
        driverName: dto.driver_name ?? null,
        driverPhone: dto.driver_phone ?? null,
        capacity: dto.capacity ?? null,
        updatedAt: new Date(),
      },
    });
  }

  async updateRoute(tenantId: string, actorUserId: string, id: string, dto: UpdateRouteDto) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transportRoute.update({
        where: { id },
        data: {
          name: dto.name,
          vehicleNumber: dto.vehicle_number ?? null,
          driverName: dto.driver_name ?? null,
          driverPhone: dto.driver_phone ?? null,
          capacity: dto.capacity ?? null,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });
      await this.audit.record(tx, {
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

  listRoutes(branchId: string) {
    return this.prisma.transportRoute.findMany({ where: { branchId, deletedAt: null }, orderBy: { name: "asc" } });
  }

  async createStop(tenantId: string, dto: CreateStopDto) {
    return this.prisma.transportStop.create({
      data: {
        id: randomUUID(),
        tenantId,
        routeId: dto.route_id,
        name: dto.name,
        sequence: dto.sequence ?? 0,
        pickupTime: dto.pickup_time ?? null,
        updatedAt: new Date(),
      },
    });
  }

  async updateStop(tenantId: string, actorUserId: string, id: string, dto: UpdateStopDto) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transportStop.update({
        where: { id },
        data: {
          name: dto.name,
          sequence: dto.sequence ?? 0,
          pickupTime: dto.pickup_time ?? null,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });
      await this.audit.record(tx, {
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

  listStops(routeId: string) {
    return this.prisma.transportStop.findMany({ where: { routeId, deletedAt: null }, orderBy: { sequence: "asc" } });
  }

  // Assigns a student to a route/stop, replacing any previous assignment.
  async assignStudentTransport(tenantId: string, actorUserId: string, dto: AssignTransportDto) {
    const now = new Date();
    return this.prisma.studentTransport.upsert({
      where: { studentId: dto.student_id },
      create: {
        id: randomUUID(),
        tenantId,
        studentId: dto.student_id,
        routeId: dto.route_id,
        stopId: dto.stop_id,
        updatedAt: now,
        updatedBy: actorUserId,
      },
      update: { routeId: dto.route_id, stopId: dto.stop_id, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
    });
  }

  async getStudentTransport(studentId: string) {
    const assignment = await this.prisma.studentTransport.findFirst({
      where: { studentId, deletedAt: null },
      include: { route: true, stop: true },
    });
    if (!assignment) {
      return null;
    }
    return {
      route_name: assignment.route.name,
      stop_name: assignment.stop.name,
      pickup_time: assignment.stop.pickupTime,
    };
  }

  async listRouteRoster(routeId: string) {
    const assignments = await this.prisma.studentTransport.findMany({
      where: { routeId, deletedAt: null, student: { deletedAt: null } },
      include: { student: true, stop: true },
      orderBy: [{ stop: { sequence: "asc" } }, { student: { firstName: "asc" } }],
    });

    return assignments.map((a) => ({
      student_id: a.studentId,
      first_name: a.student.firstName,
      last_name: a.student.lastName,
      stop_name: a.stop.name,
    }));
  }
}
