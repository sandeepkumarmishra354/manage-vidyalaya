import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { findOneForTenant, insertRow, softDeleteRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { AddElectiveGroupMemberDto } from "./dto/add-elective-group-member.dto.js";
import type { CreateClassSubjectDto } from "./dto/create-class-subject.dto.js";
import type { CreateElectiveGroupDto } from "./dto/create-elective-group.dto.js";

interface ClassRow extends TenantRow {
  branch_id: string;
}

export interface ClassSubjectRow extends TenantRow {
  branch_id: string;
  class_id: string;
  subject_id: string;
  is_elective: boolean;
}

export interface ElectiveGroupRow extends TenantRow {
  branch_id: string;
  class_id: string;
  name: string;
}

export interface ElectiveGroupMemberRow extends TenantRow {
  elective_group_id: string;
  class_subject_id: string;
}

interface StudentRow extends TenantRow {
  current_class_id: string | null;
}

@Injectable()
export class ClassSubjectsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async listClassSubjects(tenantId: string, classId: string) {
    const rows = await this.db.query<{
      id: string;
      class_id: string;
      subject_id: string;
      subject_name: string;
      is_elective: boolean;
    }>(
      tenantId,
      `SELECT cs.id, cs.class_id, cs.subject_id, sub.name AS subject_name, cs.is_elective
       FROM class_subjects cs
       JOIN subjects sub ON sub.id = cs.subject_id
       WHERE cs.tenant_id = $1 AND cs.class_id = $2 AND cs.deleted_at IS NULL
       ORDER BY sub.name ASC`,
      [tenantId, classId],
    );

    return rows.map((r) => ({
      id: r.id,
      class_id: r.class_id,
      subject_id: r.subject_id,
      subject_name: r.subject_name,
      is_elective: r.is_elective,
    }));
  }

  async addClassSubject(
    tenantId: string,
    actorUserId: string,
    classId: string,
    dto: CreateClassSubjectDto,
    branchId?: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      const klass = await findOneForTenant<ClassRow>(client, "classes", tenantId, classId, branchId);
      if (!klass) {
        throw new NotFoundException("class not found");
      }

      const created = await insertRow<ClassSubjectRow>(client, "class_subjects", tenantId, {
        branch_id: klass.branch_id,
        class_id: classId,
        subject_id: dto.subject_id,
        is_elective: dto.is_elective ?? false,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: klass.branch_id,
        actorUserId,
        entityTable: "class_subjects",
        entityId: created.id,
        action: "create",
        summary: "Added subject to class",
      });

      return created;
    });
  }

  async removeClassSubject(tenantId: string, actorUserId: string, id: string, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<ClassSubjectRow>(client, "class_subjects", tenantId, id, branchId);
      if (!existing) {
        throw new NotFoundException("class subject not found");
      }

      const deleted = await softDeleteRow<ClassSubjectRow>(client, "class_subjects", tenantId, id, actorUserId, branchId);

      await this.audit.record(client, {
        tenantId,
        branchId: existing.branch_id,
        actorUserId,
        entityTable: "class_subjects",
        entityId: id,
        action: "delete",
        summary: "Removed subject from class",
      });

      return deleted;
    });
  }

  async listElectiveGroups(tenantId: string, classId: string) {
    const groups = await this.db.query<ElectiveGroupRow>(
      tenantId,
      "SELECT * FROM subject_elective_groups WHERE tenant_id = $1 AND class_id = $2 AND deleted_at IS NULL ORDER BY name ASC",
      [tenantId, classId],
    );
    if (groups.length === 0) return [];

    const members = await this.db.query<{
      id: string;
      elective_group_id: string;
      class_subject_id: string;
      subject_id: string;
      subject_name: string;
    }>(
      tenantId,
      `SELECT m.id, m.elective_group_id, m.class_subject_id, cs.subject_id, sub.name AS subject_name
       FROM subject_elective_group_members m
       JOIN class_subjects cs ON cs.id = m.class_subject_id
       JOIN subjects sub ON sub.id = cs.subject_id
       WHERE m.tenant_id = $1 AND m.elective_group_id = ANY($2) AND m.deleted_at IS NULL`,
      [tenantId, groups.map((g) => g.id)],
    );
    const membersByGroup = new Map<string, typeof members>();
    for (const m of members) {
      const list = membersByGroup.get(m.elective_group_id) ?? [];
      list.push(m);
      membersByGroup.set(m.elective_group_id, list);
    }

    return groups.map((g) => ({
      id: g.id,
      class_id: g.class_id,
      name: g.name,
      members: (membersByGroup.get(g.id) ?? []).map((m) => ({
        id: m.id,
        class_subject_id: m.class_subject_id,
        subject_id: m.subject_id,
        subject_name: m.subject_name,
      })),
    }));
  }

  async createElectiveGroup(
    tenantId: string,
    actorUserId: string,
    classId: string,
    dto: CreateElectiveGroupDto,
    branchId?: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      const klass = await findOneForTenant<ClassRow>(client, "classes", tenantId, classId, branchId);
      if (!klass) {
        throw new NotFoundException("class not found");
      }

      const created = await insertRow<ElectiveGroupRow>(client, "subject_elective_groups", tenantId, {
        branch_id: klass.branch_id,
        class_id: classId,
        name: dto.name,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: klass.branch_id,
        actorUserId,
        entityTable: "subject_elective_groups",
        entityId: created.id,
        action: "create",
        summary: `Created elective group '${dto.name}'`,
      });

      return created;
    });
  }

  async addElectiveGroupMember(
    tenantId: string,
    actorUserId: string,
    groupId: string,
    dto: AddElectiveGroupMemberDto,
    branchId?: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      const [group, classSubject] = await Promise.all([
        findOneForTenant<ElectiveGroupRow>(client, "subject_elective_groups", tenantId, groupId, branchId),
        findOneForTenant<ClassSubjectRow>(client, "class_subjects", tenantId, dto.class_subject_id, branchId),
      ]);
      if (!group) {
        throw new NotFoundException("elective group not found");
      }
      if (!classSubject) {
        throw new NotFoundException("class subject not found");
      }
      if (!classSubject.is_elective) {
        throw new BadRequestException("subject is not marked as elective for this class");
      }
      if (classSubject.class_id !== group.class_id) {
        throw new BadRequestException("subject does not belong to the same class as the elective group");
      }

      const created = await insertRow<ElectiveGroupMemberRow>(client, "subject_elective_group_members", tenantId, {
        elective_group_id: groupId,
        class_subject_id: dto.class_subject_id,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: group.branch_id,
        actorUserId,
        entityTable: "subject_elective_group_members",
        entityId: created.id,
        action: "create",
        summary: "Added subject to elective group",
      });

      return created;
    });
  }

  async removeElectiveGroupMember(
    tenantId: string,
    actorUserId: string,
    groupId: string,
    classSubjectId: string,
    branchId?: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      // subject_elective_group_members itself carries no branch_id -- the
      // branch check has to go through its parent group instead, so a
      // branch-scoped caller can't reach a member of another branch's
      // elective group even knowing its (groupId, classSubjectId) pair.
      const conditions = [
        "m.tenant_id = $1",
        "m.elective_group_id = $2",
        "m.class_subject_id = $3",
        "m.deleted_at IS NULL",
      ];
      const values: unknown[] = [tenantId, groupId, classSubjectId];
      if (branchId) {
        values.push(branchId);
        conditions.push(`g.branch_id = $${values.length}`);
      }
      const memberResult = await client.query<ElectiveGroupMemberRow>(
        `SELECT m.* FROM subject_elective_group_members m
         JOIN subject_elective_groups g ON g.id = m.elective_group_id
         WHERE ${conditions.join(" AND ")}`,
        values,
      );
      const member = memberResult.rows[0];
      if (!member) {
        throw new NotFoundException("elective group member not found");
      }

      const deleted = await softDeleteRow<ElectiveGroupMemberRow>(
        client,
        "subject_elective_group_members",
        tenantId,
        member.id,
        actorUserId,
      );

      await this.audit.record(client, {
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
  async deleteElectiveGroup(tenantId: string, actorUserId: string, id: string, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const group = await findOneForTenant<ElectiveGroupRow>(client, "subject_elective_groups", tenantId, id, branchId);
      if (!group) {
        throw new NotFoundException("elective group not found");
      }

      const choiceCountResult = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM student_elective_choices WHERE tenant_id = $1 AND elective_group_id = $2 AND deleted_at IS NULL",
        [tenantId, id],
      );
      const choiceCount = Number(choiceCountResult.rows[0]?.count ?? "0");
      if (choiceCount > 0) {
        throw new BadRequestException("cannot delete an elective group that students have already chosen from");
      }

      const deleted = await softDeleteRow<ElectiveGroupRow>(
        client,
        "subject_elective_groups",
        tenantId,
        id,
        actorUserId,
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        branchId: group.branch_id,
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
    const student = await this.db.queryOne<StudentRow>(
      tenantId,
      "SELECT * FROM students WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL",
      [studentId, tenantId],
    );
    if (!student || !student.current_class_id) {
      return [];
    }

    const [classSubjects, choices] = await Promise.all([
      this.db.query<{ subject_id: string; subject_name: string }>(
        tenantId,
        `SELECT cs.subject_id, sub.name AS subject_name
         FROM class_subjects cs
         JOIN subjects sub ON sub.id = cs.subject_id
         WHERE cs.tenant_id = $1 AND cs.class_id = $2 AND cs.deleted_at IS NULL AND cs.is_elective = false`,
        [tenantId, student.current_class_id],
      ),
      this.db.query<{ subject_id: string; subject_name: string }>(
        tenantId,
        `SELECT c.subject_id, sub.name AS subject_name
         FROM student_elective_choices c
         JOIN subjects sub ON sub.id = c.subject_id
         WHERE c.tenant_id = $1 AND c.student_id = $2 AND c.academic_session_id = $3 AND c.deleted_at IS NULL`,
        [tenantId, studentId, academicSessionId],
      ),
    ]);

    const subjects = new Map<string, { subject_id: string; subject_name: string }>();
    for (const cs of classSubjects) {
      subjects.set(cs.subject_id, { subject_id: cs.subject_id, subject_name: cs.subject_name });
    }
    for (const choice of choices) {
      subjects.set(choice.subject_id, { subject_id: choice.subject_id, subject_name: choice.subject_name });
    }

    return Array.from(subjects.values());
  }
}
