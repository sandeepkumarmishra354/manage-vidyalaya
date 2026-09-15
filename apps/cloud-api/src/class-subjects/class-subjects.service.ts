import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AddElectiveGroupMemberDto } from "./dto/add-elective-group-member.dto.js";
import type { CreateClassSubjectDto } from "./dto/create-class-subject.dto.js";
import type { CreateElectiveGroupDto } from "./dto/create-elective-group.dto.js";

@Injectable()
export class ClassSubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listClassSubjects(classId: string) {
    const rows = await this.prisma.classSubject.findMany({
      where: { classId, deletedAt: null },
      include: { subject: true },
      orderBy: { subject: { name: "asc" } },
    });

    return rows.map((r) => ({
      id: r.id,
      class_id: r.classId,
      subject_id: r.subjectId,
      subject_name: r.subject.name,
      is_elective: r.isElective,
    }));
  }

  async addClassSubject(tenantId: string, actorUserId: string, classId: string, dto: CreateClassSubjectDto) {
    const klass = await this.prisma.class.findFirst({ where: { id: classId, tenantId, deletedAt: null } });
    if (!klass) {
      throw new NotFoundException("class not found");
    }

    const now = new Date();
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.classSubject.create({
        data: {
          id,
          tenantId,
          branchId: klass.branchId,
          classId,
          subjectId: dto.subject_id,
          isElective: dto.is_elective ?? false,
          updatedAt: now,
          updatedBy: actorUserId,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: klass.branchId,
        actorUserId,
        entityTable: "class_subjects",
        entityId: id,
        action: "create",
        summary: "Added subject to class",
      });

      return created;
    });
  }

  async removeClassSubject(tenantId: string, actorUserId: string, id: string) {
    const existing = await this.prisma.classSubject.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("class subject not found");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.classSubject.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: existing.branchId,
        actorUserId,
        entityTable: "class_subjects",
        entityId: id,
        action: "delete",
        summary: "Removed subject from class",
      });

      return deleted;
    });
  }

  async listElectiveGroups(classId: string) {
    const groups = await this.prisma.subjectElectiveGroup.findMany({
      where: { classId, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        members: {
          where: { deletedAt: null },
          include: { classSubject: { include: { subject: true } } },
        },
      },
    });

    return groups.map((g) => ({
      id: g.id,
      class_id: g.classId,
      name: g.name,
      members: g.members.map((m) => ({
        id: m.id,
        class_subject_id: m.classSubjectId,
        subject_id: m.classSubject.subjectId,
        subject_name: m.classSubject.subject.name,
      })),
    }));
  }

  async createElectiveGroup(tenantId: string, actorUserId: string, classId: string, dto: CreateElectiveGroupDto) {
    const klass = await this.prisma.class.findFirst({ where: { id: classId, tenantId, deletedAt: null } });
    if (!klass) {
      throw new NotFoundException("class not found");
    }

    const now = new Date();
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.subjectElectiveGroup.create({
        data: {
          id,
          tenantId,
          branchId: klass.branchId,
          classId,
          name: dto.name,
          updatedAt: now,
          updatedBy: actorUserId,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: klass.branchId,
        actorUserId,
        entityTable: "subject_elective_groups",
        entityId: id,
        action: "create",
        summary: `Created elective group '${dto.name}'`,
      });

      return created;
    });
  }

  async addElectiveGroupMember(tenantId: string, actorUserId: string, groupId: string, dto: AddElectiveGroupMemberDto) {
    const [group, classSubject] = await Promise.all([
      this.prisma.subjectElectiveGroup.findFirst({ where: { id: groupId, tenantId, deletedAt: null } }),
      this.prisma.classSubject.findFirst({ where: { id: dto.class_subject_id, tenantId, deletedAt: null } }),
    ]);
    if (!group) {
      throw new NotFoundException("elective group not found");
    }
    if (!classSubject) {
      throw new NotFoundException("class subject not found");
    }
    if (!classSubject.isElective) {
      throw new BadRequestException("subject is not marked as elective for this class");
    }
    if (classSubject.classId !== group.classId) {
      throw new BadRequestException("subject does not belong to the same class as the elective group");
    }

    const now = new Date();
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.subjectElectiveGroupMember.create({
        data: {
          id,
          tenantId,
          electiveGroupId: groupId,
          classSubjectId: dto.class_subject_id,
          updatedAt: now,
          updatedBy: actorUserId,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: group.branchId,
        actorUserId,
        entityTable: "subject_elective_group_members",
        entityId: id,
        action: "create",
        summary: "Added subject to elective group",
      });

      return created;
    });
  }

  async removeElectiveGroupMember(tenantId: string, actorUserId: string, groupId: string, classSubjectId: string) {
    const member = await this.prisma.subjectElectiveGroupMember.findFirst({
      where: { electiveGroupId: groupId, classSubjectId, tenantId, deletedAt: null },
    });
    if (!member) {
      throw new NotFoundException("elective group member not found");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.subjectElectiveGroupMember.update({
        where: { id: member.id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "subject_elective_group_members",
        entityId: member.id,
        action: "delete",
        summary: "Removed subject from elective group",
      });

      return deleted;
    });
  }

  // Blocked once any student has chosen from this group -- deleting it out
  // from under an already-made choice would silently orphan that choice.
  async deleteElectiveGroup(tenantId: string, actorUserId: string, id: string) {
    const group = await this.prisma.subjectElectiveGroup.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!group) {
      throw new NotFoundException("elective group not found");
    }

    const choiceCount = await this.prisma.studentElectiveChoice.count({
      where: { electiveGroupId: id, deletedAt: null },
    });
    if (choiceCount > 0) {
      throw new BadRequestException("cannot delete an elective group that students have already chosen from");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.subjectElectiveGroup.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: group.branchId,
        actorUserId,
        entityTable: "subject_elective_groups",
        entityId: id,
        action: "delete",
        summary: `Deleted elective group '${group.name}'`,
      });

      return deleted;
    });
  }

  // A student's full applicable-subject set for a session: every mandatory
  // subject for their current class, plus whatever they've elected from
  // each elective group for that session. Used by the exams module to know
  // which subjects a given student's results must cover.
  async getApplicableSubjectsForStudent(tenantId: string, studentId: string, academicSessionId: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, tenantId, deletedAt: null } });
    if (!student || !student.currentClassId) {
      return [];
    }

    const [classSubjects, choices] = await Promise.all([
      this.prisma.classSubject.findMany({
        where: { classId: student.currentClassId, tenantId, deletedAt: null, isElective: false },
        include: { subject: true },
      }),
      this.prisma.studentElectiveChoice.findMany({
        where: { studentId, academicSessionId, deletedAt: null },
        include: { subject: true },
      }),
    ]);

    const subjects = new Map<string, { subject_id: string; subject_name: string }>();
    for (const cs of classSubjects) {
      subjects.set(cs.subjectId, { subject_id: cs.subjectId, subject_name: cs.subject.name });
    }
    for (const choice of choices) {
      subjects.set(choice.subjectId, { subject_id: choice.subjectId, subject_name: choice.subject.name });
    }

    return Array.from(subjects.values());
  }
}
