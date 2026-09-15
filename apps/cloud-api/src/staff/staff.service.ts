import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateStaffDto } from "./dto/create-staff.dto.js";
import type { CreateTeacherAssignmentDto } from "./dto/create-teacher-assignment.dto.js";
import type { SetClassTeacherDto } from "./dto/set-class-teacher.dto.js";
import type { SetStaffStatusDto } from "./dto/set-staff-status.dto.js";
import type { UpdateStaffDto } from "./dto/update-staff.dto.js";

function toDateOrNull(value?: string | null) {
  return value ? new Date(value) : null;
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listStaff(branchId: string, search?: string) {
    const term = (search ?? "").trim();
    const staff = await this.prisma.staff.findMany({
      where: {
        branchId,
        deletedAt: null,
        ...(term
          ? {
              OR: [
                { firstName: { contains: term, mode: "insensitive" } },
                { lastName: { contains: term, mode: "insensitive" } },
                { employeeCode: { contains: term, mode: "insensitive" } },
                { designation: { contains: term, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { firstName: "asc" },
    });

    return staff.map((s) => ({
      id: s.id,
      employee_code: s.employeeCode,
      first_name: s.firstName,
      last_name: s.lastName,
      designation: s.designation,
      category_id: s.categoryId,
      department: s.department,
      status: s.status,
      has_login: s.userId !== null,
    }));
  }

  async getStaff(id: string) {
    return this.prisma.staff.findUniqueOrThrow({ where: { id, deletedAt: null } });
  }

  async createStaff(tenantId: string, actorUserId: string, dto: CreateStaffDto) {
    const id = randomUUID();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const staff = await tx.staff.create({
        data: {
          id,
          tenantId,
          branchId: dto.branch_id,
          employeeCode: dto.employee_code,
          firstName: dto.first_name,
          lastName: dto.last_name ?? null,
          dateOfBirth: toDateOrNull(dto.date_of_birth),
          gender: dto.gender ?? null,
          phone: dto.phone ?? null,
          personalEmail: dto.personal_email ?? null,
          address: dto.address ?? null,
          city: dto.city ?? null,
          state: dto.state ?? null,
          pincode: dto.pincode ?? null,
          designation: dto.designation,
          categoryId: dto.category_id ?? null,
          department: dto.department ?? null,
          employmentType: dto.employment_type,
          dateOfJoining: new Date(dto.date_of_joining),
          status: "active",
          qualification: dto.qualification ?? null,
          bloodGroup: dto.blood_group ?? null,
          panNumber: dto.pan_number ?? null,
          aadhaarNumber: dto.aadhaar_number ?? null,
          bankAccountNumber: dto.bank_account_number ?? null,
          bankIfsc: dto.bank_ifsc ?? null,
          bankName: dto.bank_name ?? null,
          pfNumber: dto.pf_number ?? null,
          esiNumber: dto.esi_number ?? null,
          uanNumber: dto.uan_number ?? null,
          emergencyContactName: dto.emergency_contact_name ?? null,
          emergencyContactPhone: dto.emergency_contact_phone ?? null,
          notes: dto.notes ?? null,
          updatedAt: now,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "staff",
        entityId: id,
        action: "create",
        summary: `Added staff member '${dto.first_name} ${dto.last_name ?? ""}'`.trim(),
      });

      return staff;
    });
  }

  async updateStaff(tenantId: string, actorUserId: string, id: string, dto: UpdateStaffDto) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.staff.update({
        where: { id },
        data: {
          employeeCode: dto.employee_code,
          firstName: dto.first_name,
          lastName: dto.last_name ?? null,
          dateOfBirth: toDateOrNull(dto.date_of_birth),
          gender: dto.gender ?? null,
          phone: dto.phone ?? null,
          personalEmail: dto.personal_email ?? null,
          address: dto.address ?? null,
          city: dto.city ?? null,
          state: dto.state ?? null,
          pincode: dto.pincode ?? null,
          designation: dto.designation,
          categoryId: dto.category_id ?? null,
          department: dto.department ?? null,
          employmentType: dto.employment_type,
          dateOfJoining: new Date(dto.date_of_joining),
          qualification: dto.qualification ?? null,
          bloodGroup: dto.blood_group ?? null,
          panNumber: dto.pan_number ?? null,
          aadhaarNumber: dto.aadhaar_number ?? null,
          bankAccountNumber: dto.bank_account_number ?? null,
          bankIfsc: dto.bank_ifsc ?? null,
          bankName: dto.bank_name ?? null,
          pfNumber: dto.pf_number ?? null,
          esiNumber: dto.esi_number ?? null,
          uanNumber: dto.uan_number ?? null,
          emergencyContactName: dto.emergency_contact_name ?? null,
          emergencyContactPhone: dto.emergency_contact_phone ?? null,
          notes: dto.notes ?? null,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "staff",
        entityId: id,
        action: "update",
        summary: "Updated staff profile",
      });

      return updated;
    });
  }

  // Deactivates (or reactivates) a staff member -- the soft-delete
  // equivalent for HR records; employment history is preserved.
  async setStaffStatus(tenantId: string, actorUserId: string, staffId: string, dto: SetStaffStatusDto) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.staff.update({
        where: { id: staffId },
        data: {
          status: dto.status,
          dateOfLeaving: toDateOrNull(dto.date_of_leaving),
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "staff",
        entityId: staffId,
        action: "update",
        summary: `Set staff status to '${dto.status}'`,
      });

      return updated;
    });
  }

  async listTeacherAssignments(branchId: string, staffId?: string) {
    const assignments = await this.prisma.teacherSubjectAssignment.findMany({
      where: { branchId, deletedAt: null, ...(staffId ? { staffId } : {}) },
      include: { staff: true, class: true, section: true, subject: true },
      orderBy: [{ class: { sortOrder: "asc" } }, { staff: { firstName: "asc" } }],
    });

    return assignments.map((a) => ({
      id: a.id,
      staff_id: a.staffId,
      staff_name: [a.staff.firstName, a.staff.lastName].filter(Boolean).join(" "),
      class_id: a.classId,
      class_name: a.class.name,
      section_id: a.sectionId,
      section_name: a.section?.name ?? null,
      subject_id: a.subjectId,
      subject_name: a.subject.name,
      academic_session_id: a.academicSessionId,
    }));
  }

  async createTeacherAssignment(tenantId: string, actorUserId: string, dto: CreateTeacherAssignmentDto) {
    const id = randomUUID();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.teacherSubjectAssignment.create({
        data: {
          id,
          tenantId,
          branchId: dto.branch_id,
          staffId: dto.staff_id,
          classId: dto.class_id,
          sectionId: dto.section_id ?? null,
          subjectId: dto.subject_id,
          academicSessionId: dto.academic_session_id,
          updatedAt: now,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "teacher_subject_assignments",
        entityId: id,
        action: "create",
        summary: "Assigned teacher to subject/class",
      });

      return created;
    });
  }

  async deleteTeacherAssignment(tenantId: string, actorUserId: string, id: string) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.teacherSubjectAssignment.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "teacher_subject_assignments",
        entityId: id,
        action: "delete",
        summary: "Removed teacher assignment",
      });

      return deleted;
    });
  }

  async setClassTeacher(tenantId: string, actorUserId: string, sectionId: string, dto: SetClassTeacherDto) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      if (dto.staff_id) {
        const conflict = await tx.section.findFirst({
          where: { classTeacherStaffId: dto.staff_id, deletedAt: null, id: { not: sectionId } },
          include: { class: true },
        });
        if (conflict) {
          throw new BadRequestException(
            `This staff member is already class teacher of another section (${conflict.class.name} - ${conflict.name}).`,
          );
        }
      }

      const updated = await tx.section.update({
        where: { id: sectionId },
        data: {
          classTeacherStaffId: dto.staff_id ?? null,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        actorUserId,
        entityTable: "sections",
        entityId: sectionId,
        action: "update",
        summary: "Set class teacher",
      });

      return updated;
    });
  }
}
