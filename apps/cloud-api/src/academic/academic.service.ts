import { randomUUID } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateAcademicSessionDto } from "./dto/create-academic-session.dto.js";
import type { CreateClassDto } from "./dto/create-class.dto.js";
import type { CreateSectionDto } from "./dto/create-section.dto.js";
import type { UpdateAcademicSessionDto } from "./dto/update-academic-session.dto.js";
import type { UpdateBranchDto } from "./dto/update-branch.dto.js";
import type { UpdateClassDto } from "./dto/update-class.dto.js";
import type { UpdateSectionDto } from "./dto/update-section.dto.js";

@Injectable()
export class AcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listBranches(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async updateBranch(tenantId: string, actorUserId: string, id: string, dto: UpdateBranchDto) {
    const existing = await this.prisma.branch.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("branch not found");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.branch.update({
        where: { id },
        data: {
          name: dto.name,
          address: dto.address ?? null,
          city: dto.city ?? null,
          state: dto.state ?? null,
          pincode: dto.pincode ?? null,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          logoUrl: dto.logo_url ?? null,
          signatureUrl: dto.signature_url ?? null,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: id,
        actorUserId,
        entityTable: "branches",
        entityId: id,
        action: "update",
        summary: `Updated school details for branch '${dto.name}'`,
      });

      return updated;
    });
  }

  listAcademicSessions(tenantId: string) {
    return this.prisma.academicSession.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { startDate: "desc" },
    });
  }

  async createAcademicSession(tenantId: string, actorUserId: string, dto: CreateAcademicSessionDto) {
    const now = new Date();
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      if (dto.is_current) {
        await this.demoteOtherSessions(tx, tenantId, now);
      }

      const session = await tx.academicSession.create({
        data: {
          id,
          tenantId,
          name: dto.name,
          startDate: new Date(dto.start_date),
          endDate: new Date(dto.end_date),
          isCurrent: dto.is_current,
          updatedAt: now,
          updatedBy: actorUserId,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "academic_sessions",
        entityId: id,
        action: "create",
        summary: `Created academic session '${dto.name}'`,
      });

      return session;
    });
  }

  async updateAcademicSession(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateAcademicSessionDto,
  ) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      if (dto.is_current) {
        await this.demoteOtherSessions(tx, tenantId, now);
      }

      const session = await tx.academicSession.update({
        where: { id },
        data: {
          name: dto.name,
          startDate: new Date(dto.start_date),
          endDate: new Date(dto.end_date),
          isCurrent: dto.is_current,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "academic_sessions",
        entityId: id,
        action: "update",
        summary: "Updated academic session",
      });

      return session;
    });
  }

  // If the new/updated session is current, every other session for the
  // tenant is demoted first so exactly one session is ever current at a
  // time (mirrors the old demote_other_sessions in commands/branches.rs).
  private async demoteOtherSessions(tx: Prisma.TransactionClient, tenantId: string, now: Date) {
    await tx.academicSession.updateMany({
      where: { tenantId, isCurrent: true },
      data: { isCurrent: false, updatedAt: now },
    });
  }

  listClasses(tenantId: string, branchId: string) {
    return this.prisma.class.findMany({
      where: { tenantId, branchId, deletedAt: null },
      orderBy: { sortOrder: "asc" },
    });
  }

  async createClass(tenantId: string, actorUserId: string, dto: CreateClassDto) {
    const now = new Date();
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.class.create({
        data: {
          id,
          tenantId,
          branchId: dto.branch_id,
          academicSessionId: dto.academic_session_id,
          name: dto.name,
          sortOrder: dto.sort_order ?? 0,
          updatedAt: now,
          updatedBy: actorUserId,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "classes",
        entityId: id,
        action: "create",
        summary: `Created class '${dto.name}'`,
      });

      return created;
    });
  }

  async updateClass(tenantId: string, actorUserId: string, id: string, dto: UpdateClassDto) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.class.update({
        where: { id },
        data: { name: dto.name, sortOrder: dto.sort_order, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "classes",
        entityId: id,
        action: "update",
        summary: `Renamed class to '${dto.name}'`,
      });

      return updated;
    });
  }

  async deleteClass(tenantId: string, actorUserId: string, id: string) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.class.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "classes",
        entityId: id,
        action: "delete",
        summary: "Deleted class",
      });

      return deleted;
    });
  }

  listSections(tenantId: string, classId: string) {
    return this.prisma.section.findMany({
      where: { tenantId, classId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async createSection(tenantId: string, actorUserId: string, dto: CreateSectionDto) {
    const now = new Date();
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.section.create({
        data: {
          id,
          tenantId,
          classId: dto.class_id,
          name: dto.name,
          capacity: dto.capacity ?? null,
          updatedAt: now,
          updatedBy: actorUserId,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "sections",
        entityId: id,
        action: "create",
        summary: `Created section '${dto.name}'`,
      });

      return created;
    });
  }

  async updateSection(tenantId: string, actorUserId: string, id: string, dto: UpdateSectionDto) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.section.update({
        where: { id },
        data: {
          name: dto.name,
          capacity: dto.capacity ?? null,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "sections",
        entityId: id,
        action: "update",
        summary: `Renamed section to '${dto.name}'`,
      });

      return updated;
    });
  }

  async deleteSection(tenantId: string, actorUserId: string, id: string) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.section.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "sections",
        entityId: id,
        action: "delete",
        summary: "Deleted section",
      });

      return deleted;
    });
  }
}
