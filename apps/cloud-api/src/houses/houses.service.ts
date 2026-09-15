import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AssignHouseDto } from "./dto/assign-house.dto.js";
import type { AwardPointsDto } from "./dto/award-points.dto.js";
import type { CreateHouseDto } from "./dto/create-house.dto.js";
import type { UpdateHouseDto } from "./dto/update-house.dto.js";

@Injectable()
export class HousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createHouse(tenantId: string, dto: CreateHouseDto) {
    return this.prisma.house.create({
      data: { id: randomUUID(), tenantId, branchId: dto.branch_id, name: dto.name, color: dto.color ?? null, updatedAt: new Date() },
    });
  }

  async updateHouse(tenantId: string, actorUserId: string, id: string, dto: UpdateHouseDto) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.house.update({
        where: { id },
        data: { name: dto.name, color: dto.color ?? null, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });
      await this.audit.record(tx, {
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

  listHouses(branchId: string) {
    return this.prisma.house.findMany({ where: { branchId, deletedAt: null }, orderBy: { name: "asc" } });
  }

  // Assigns a student to a house, replacing any previous assignment (a
  // student has at most one house at a time).
  async assignStudentHouse(tenantId: string, actorUserId: string, dto: AssignHouseDto) {
    const now = new Date();
    return this.prisma.studentHouse.upsert({
      where: { studentId: dto.student_id },
      create: { id: randomUUID(), tenantId, studentId: dto.student_id, houseId: dto.house_id, updatedAt: now, updatedBy: actorUserId },
      update: { houseId: dto.house_id, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
    });
  }

  async getStudentHouse(studentId: string) {
    const studentHouse = await this.prisma.studentHouse.findFirst({
      where: { studentId, deletedAt: null, house: { deletedAt: null } },
      include: { house: true },
    });
    return studentHouse?.house ?? null;
  }

  async awardHousePoints(tenantId: string, dto: AwardPointsDto) {
    return this.prisma.housePointEvent.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: dto.branch_id,
        houseId: dto.house_id,
        studentId: dto.student_id ?? null,
        academicSessionId: dto.academic_session_id ?? null,
        points: dto.points,
        reason: dto.reason,
        eventDate: new Date(dto.event_date),
        updatedAt: new Date(),
      },
    });
  }

  async listHousePointEvents(branchId: string) {
    const events = await this.prisma.housePointEvent.findMany({
      where: { branchId, deletedAt: null },
      include: { house: true, student: true },
      orderBy: { eventDate: "desc" },
      take: 200,
    });

    return events.map((e) => ({
      id: e.id,
      house_name: e.house.name,
      student_name: e.student ? [e.student.firstName, e.student.lastName].filter(Boolean).join(" ") : null,
      points: e.points,
      reason: e.reason,
      event_date: e.eventDate,
    }));
  }

  async getHouseLeaderboard(branchId: string, academicSessionId?: string) {
    const houses = await this.prisma.house.findMany({ where: { branchId, deletedAt: null } });

    const rows = await Promise.all(
      houses.map(async (house) => {
        const [pointsAgg, studentCount] = await Promise.all([
          this.prisma.housePointEvent.aggregate({
            where: { houseId: house.id, deletedAt: null, ...(academicSessionId ? { academicSessionId } : {}) },
            _sum: { points: true },
          }),
          this.prisma.studentHouse.count({ where: { houseId: house.id, deletedAt: null } }),
        ]);

        return {
          house_id: house.id,
          house_name: house.name,
          color: house.color,
          total_points: pointsAgg._sum.points ?? 0,
          student_count: studentCount,
        };
      }),
    );

    return rows.sort((a, b) => b.total_points - a.total_points);
  }
}
