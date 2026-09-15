import { randomUUID } from "node:crypto";

import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateAdmissionDto } from "./dto/create-admission.dto.js";
import type { UpdateGuardianDto } from "./dto/update-guardian.dto.js";
import type { UpdateStudentDto } from "./dto/update-student.dto.js";

const MAX_ADMISSION_NUMBER_ATTEMPTS = 20;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listStudents(tenantId: string, branchId: string, search?: string) {
    const term = (search ?? "").trim();

    const students = await this.prisma.student.findMany({
      where: {
        tenantId,
        branchId,
        deletedAt: null,
        ...(term
          ? {
              OR: [
                { firstName: { contains: term, mode: "insensitive" } },
                { lastName: { contains: term, mode: "insensitive" } },
                { admissionNumber: { contains: term, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { currentClass: true, currentSection: true },
      orderBy: { firstName: "asc" },
    });

    return students.map((s) => ({
      id: s.id,
      admission_number: s.admissionNumber,
      first_name: s.firstName,
      last_name: s.lastName,
      status: s.status,
      class_name: s.currentClass?.name ?? null,
      section_name: s.currentSection?.name ?? null,
    }));
  }

  async listStudentsInClass(classId: string) {
    const students = await this.prisma.student.findMany({
      where: { currentClassId: classId, deletedAt: null, status: "enrolled" },
      include: { currentClass: true, currentSection: true },
      orderBy: { firstName: "asc" },
    });

    return students.map((s) => ({
      id: s.id,
      admission_number: s.admissionNumber,
      first_name: s.firstName,
      last_name: s.lastName,
      status: s.status,
      class_name: s.currentClass?.name ?? null,
      section_name: s.currentSection?.name ?? null,
    }));
  }

  async getStudent(id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      include: {
        studentGuardians: { include: { guardian: true } },
      },
    });
    if (!student) {
      throw new NotFoundException("student not found");
    }

    return {
      id: student.id,
      tenant_id: student.tenantId,
      branch_id: student.branchId,
      admission_number: student.admissionNumber,
      first_name: student.firstName,
      last_name: student.lastName,
      date_of_birth: student.dateOfBirth,
      gender: student.gender,
      current_class_id: student.currentClassId,
      current_section_id: student.currentSectionId,
      status: student.status,
      address: student.address,
      updated_at: student.updatedAt,
      version: student.version,
      guardians: student.studentGuardians
        .filter((sg) => sg.guardian.deletedAt === null)
        .map((sg) => ({
          id: sg.guardian.id,
          full_name: sg.guardian.fullName,
          relation: sg.guardian.relation,
          phone: sg.guardian.phone,
          email: sg.guardian.email,
        })),
    };
  }

  // Creates a student + guardian + student_guardian + admission record in
  // one transaction -- the same vertical slice the old offline-write ->
  // outbox -> sync architecture proved end to end, now a single Postgres
  // transaction instead of a local SQLite write plus a queued outbox row.
  async createAdmission(tenantId: string, actorUserId: string, dto: CreateAdmissionDto) {
    const now = new Date();
    const studentId = randomUUID();
    const guardianId = randomUUID();
    const studentGuardianId = randomUUID();
    const admissionId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      await tx.student.create({
        data: {
          id: studentId,
          tenantId,
          branchId: dto.branch_id,
          firstName: dto.first_name,
          lastName: dto.last_name ?? null,
          dateOfBirth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
          gender: dto.gender ?? null,
          currentClassId: dto.applied_class_id ?? null,
          status: "applied",
          address: dto.address ?? null,
          updatedAt: now,
        },
      });

      await tx.guardian.create({
        data: {
          id: guardianId,
          tenantId,
          fullName: dto.guardian_name,
          relation: dto.guardian_relation,
          phone: dto.guardian_phone ?? null,
          email: dto.guardian_email ?? null,
          updatedAt: now,
        },
      });

      await tx.studentGuardian.create({
        data: {
          id: studentGuardianId,
          tenantId,
          studentId,
          guardianId,
          relation: dto.guardian_relation,
          isPrimaryContact: true,
          updatedAt: now,
        },
      });

      const admission = await tx.admission.create({
        data: {
          id: admissionId,
          tenantId,
          branchId: dto.branch_id,
          studentId,
          appliedClassId: dto.applied_class_id ?? null,
          academicSessionId: dto.academic_session_id,
          stage: "applied",
          appliedAt: now,
          updatedAt: now,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "admissions",
        entityId: admissionId,
        action: "create",
        summary: "New admission enquiry",
      });

      return {
        id: admission.id,
        student_id: studentId,
        branch_id: admission.branchId,
        stage: admission.stage,
        applied_at: admission.appliedAt,
      };
    });
  }

  async getAdmissionForStudent(studentId: string) {
    const admission = await this.prisma.admission.findFirst({
      where: { studentId, deletedAt: null },
    });
    if (!admission) {
      return null;
    }
    return {
      id: admission.id,
      student_id: admission.studentId,
      branch_id: admission.branchId,
      stage: admission.stage,
      applied_at: admission.appliedAt,
    };
  }

  // Assigns a real, branch+year-scoped, sequential admission number
  // (MAIN-2026-0001) and flips the student to `enrolled`. Postgres is now
  // the single source of truth (no more per-device SQLite), so concurrent
  // confirms from different clients are a real possibility -- the bounded
  // retry loop against the UNIQUE (tenant_id, admission_number) constraint
  // absorbs that race exactly like the old same-device retry did.
  async confirmAdmission(tenantId: string, actorUserId: string, admissionId: string) {
    const admission = await this.prisma.admission.findFirst({
      where: { id: admissionId, deletedAt: null },
    });
    if (!admission) {
      throw new NotFoundException("admission not found");
    }

    const branch = await this.prisma.branch.findUniqueOrThrow({ where: { id: admission.branchId } });
    const year = new Date().getUTCFullYear().toString();
    const prefix = `${branch.code}-${year}-`;

    const existingCount = await this.prisma.student.count({
      where: { tenantId, admissionNumber: { startsWith: prefix } },
    });
    let nextSeq = existingCount + 1;
    let admissionNumber: string | undefined;

    for (let attempt = 1; attempt <= MAX_ADMISSION_NUMBER_ATTEMPTS; attempt++) {
      const candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
      try {
        await this.prisma.student.update({
          where: { id: admission.studentId },
          data: {
            admissionNumber: candidate,
            status: "enrolled",
            updatedAt: new Date(),
            version: { increment: 1 },
          },
        });
        admissionNumber = candidate;
        break;
      } catch (error) {
        const isUniqueClash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
        if (isUniqueClash && attempt < MAX_ADMISSION_NUMBER_ATTEMPTS) {
          nextSeq += 1;
          continue;
        }
        throw error;
      }
    }

    if (!admissionNumber) {
      throw new ConflictException("could not allocate an admission number, please retry");
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.admission.update({
        where: { id: admissionId },
        data: { stage: "enrolled", decidedAt: now, decidedBy: actorUserId, updatedAt: now, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "admissions",
        entityId: admissionId,
        action: "update",
        summary: `Confirmed admission, assigned number ${admissionNumber}`,
      });
    });

    return {
      admission_id: admissionId,
      student_id: admission.studentId,
      admission_number: admissionNumber,
      stage: "enrolled",
    };
  }

  async updateStudent(tenantId: string, actorUserId: string, id: string, dto: UpdateStudentDto) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.student.update({
        where: { id },
        data: {
          firstName: dto.first_name,
          lastName: dto.last_name ?? null,
          dateOfBirth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
          gender: dto.gender ?? null,
          bloodGroup: dto.blood_group ?? null,
          currentClassId: dto.current_class_id ?? null,
          currentSectionId: dto.current_section_id ?? null,
          address: dto.address ?? null,
          city: dto.city ?? null,
          state: dto.state ?? null,
          pincode: dto.pincode ?? null,
          notes: dto.notes ?? null,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "students",
        entityId: id,
        action: "update",
        summary: "Updated student profile",
      });

      return updated;
    });
  }

  // Soft-delete only; a student leaving the school normally goes through
  // updateStudent (status = withdrawn/alumni) instead, which preserves
  // their attendance/fee/exam history. Deletion is for data-entry mistakes.
  async deleteStudent(tenantId: string, actorUserId: string, id: string) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.student.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "students",
        entityId: id,
        action: "delete",
        summary: "Deleted student record",
      });

      return deleted;
    });
  }

  async updateGuardian(tenantId: string, actorUserId: string, id: string, dto: UpdateGuardianDto) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.guardian.update({
        where: { id },
        data: {
          fullName: dto.full_name,
          relation: dto.relation ?? null,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "guardians",
        entityId: id,
        action: "update",
        summary: "Updated guardian details",
      });

      return updated;
    });
  }
}
