import { randomUUID } from "node:crypto";

import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service.js";
import { FeesService } from "../fees/fees.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { QrTokenService } from "../qr/qr-token.service.js";
import { StorageService } from "../storage/storage.service.js";
import type { AddGuardianDto } from "./dto/add-guardian.dto.js";
import type { CreateAdmissionDto } from "./dto/create-admission.dto.js";
import type { ElectSubjectDto } from "./dto/elect-subject.dto.js";
import type { IssueTransferCertificateDto } from "./dto/issue-transfer-certificate.dto.js";
import type { UpdateGuardianDto } from "./dto/update-guardian.dto.js";
import type { UpdateStudentDto } from "./dto/update-student.dto.js";

const MAX_ADMISSION_NUMBER_ATTEMPTS = 20;

// Same convention as DocumentsService's sanitizeExtension.
function sanitizePhotoExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  const ext = fileName
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ext.slice(0, 10);
}

// Same convention as generateReceiptNumber in fees.service.ts.
function generateTcNumber(branchId: string): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `TC-${branchId.slice(0, 4).toUpperCase()}-${datePart}-${rand}`;
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly feesService: FeesService,
    private readonly qrToken: QrTokenService,
    private readonly storage: StorageService,
  ) {}

  async listStudents(
    tenantId: string,
    branchId: string,
    search?: string,
    filters?: { status?: string; classId?: string; sectionId?: string; gender?: string },
  ) {
    const term = (search ?? "").trim();

    const students = await this.prisma.student.findMany({
      where: {
        tenantId,
        branchId,
        deletedAt: null,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.classId ? { currentClassId: filters.classId } : {}),
        ...(filters?.sectionId ? { currentSectionId: filters.sectionId } : {}),
        ...(filters?.gender ? { gender: filters.gender } : {}),
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
      roll_number: s.rollNumber,
      first_name: s.firstName,
      last_name: s.lastName,
      status: s.status,
      class_name: s.currentClass?.name ?? null,
      section_name: s.currentSection?.name ?? null,
      graduation_year: s.graduationYear,
      higher_education: s.higherEducation,
      current_occupation: s.currentOccupation,
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
      roll_number: s.rollNumber,
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
        currentClass: true,
        currentSection: true,
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
      roll_number: student.rollNumber,
      first_name: student.firstName,
      last_name: student.lastName,
      date_of_birth: student.dateOfBirth,
      gender: student.gender,
      blood_group: student.bloodGroup,
      current_class_id: student.currentClassId,
      current_section_id: student.currentSectionId,
      class_name: student.currentClass?.name ?? null,
      section_name: student.currentSection?.name ?? null,
      status: student.status,
      address: student.address,
      city: student.city,
      state: student.state,
      pincode: student.pincode,
      notes: student.notes,
      category: student.category,
      religion: student.religion,
      nationality: student.nationality,
      mother_tongue: student.motherTongue,
      aadhaar_number: student.aadhaarNumber,
      previous_school_name: student.previousSchoolName,
      medical_notes: student.medicalNotes,
      emergency_contact_name: student.emergencyContactName,
      emergency_contact_phone: student.emergencyContactPhone,
      date_of_leaving: student.dateOfLeaving,
      reason_for_leaving: student.reasonForLeaving,
      tc_number: student.tcNumber,
      tc_issue_date: student.tcIssueDate,
      conduct_remark: student.conductRemark,
      graduation_year: student.graduationYear,
      higher_education: student.higherEducation,
      current_occupation: student.currentOccupation,
      alumni_contact_email: student.alumniContactEmail,
      alumni_notes: student.alumniNotes,
      updated_at: student.updatedAt,
      version: student.version,
      guardians: student.studentGuardians
        .filter((sg) => sg.guardian.deletedAt === null)
        .map((sg) => ({
          id: sg.guardian.id,
          full_name: sg.guardian.fullName,
          relation: sg.guardian.relation,
          phone: sg.guardian.phone,
          alt_phone: sg.guardian.altPhone,
          email: sg.guardian.email,
          occupation: sg.guardian.occupation,
          address: sg.guardian.address,
          aadhaar_number: sg.guardian.aadhaarNumber,
          annual_income: sg.guardian.annualIncome,
          is_primary_contact: sg.isPrimaryContact,
        })),
    };
  }

  // Other enrolled students who share at least one guardian with this
  // student -- de-duplicated since two students can share more than one
  // guardian (e.g. both a father and mother in common).
  async getSiblings(studentId: string) {
    const links = await this.prisma.studentGuardian.findMany({ where: { studentId } });
    const guardianIds = links.map((l) => l.guardianId);
    if (guardianIds.length === 0) {
      return [];
    }

    const siblingLinks = await this.prisma.studentGuardian.findMany({
      where: {
        guardianId: { in: guardianIds },
        studentId: { not: studentId },
        student: { deletedAt: null, status: "enrolled" },
      },
      include: { student: { include: { currentClass: true, currentSection: true } } },
    });

    const byStudentId = new Map<string, (typeof siblingLinks)[number]["student"]>();
    for (const link of siblingLinks) {
      byStudentId.set(link.student.id, link.student);
    }

    return Array.from(byStudentId.values()).map((s) => ({
      id: s.id,
      first_name: s.firstName,
      last_name: s.lastName,
      admission_number: s.admissionNumber,
      class_name: s.currentClass?.name ?? null,
      section_name: s.currentSection?.name ?? null,
    }));
  }

  // Search existing guardians by phone/name within the tenant, so a
  // second admission for a sibling can link the same guardian instead of
  // creating a duplicate. Each result includes the students already
  // linked to it, so the UI can show "already parent of X" before linking.
  async searchGuardians(tenantId: string, search: string) {
    const term = (search ?? "").trim();
    if (term.length < 2) {
      return [];
    }

    const guardians = await this.prisma.guardian.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ phone: { contains: term } }, { fullName: { contains: term, mode: "insensitive" } }],
      },
      include: {
        studentGuardians: {
          include: { student: { include: { currentClass: true } } },
        },
      },
      take: 20,
    });

    return guardians.map((g) => ({
      id: g.id,
      full_name: g.fullName,
      relation: g.relation,
      phone: g.phone,
      alt_phone: g.altPhone,
      email: g.email,
      occupation: g.occupation,
      address: g.address,
      aadhaar_number: g.aadhaarNumber,
      annual_income: g.annualIncome,
      linked_students: g.studentGuardians
        .filter((sg) => sg.student.deletedAt === null)
        .map((sg) => ({
          id: sg.student.id,
          name: [sg.student.firstName, sg.student.lastName].filter(Boolean).join(" "),
          class_name: sg.student.currentClass?.name ?? null,
        })),
    }));
  }

  // One guardian's full profile plus every student linked to them -- backs
  // the Guardian detail page. Unlike getSiblings (student-centric, only
  // returns enrolled siblings of one student), this is guardian-centric
  // and returns every linked child regardless of enrollment status, since
  // a guardian's own page should show their full family, not just who's
  // currently enrolled.
  async getGuardian(tenantId: string, guardianId: string) {
    const guardian = await this.prisma.guardian.findFirst({
      where: { id: guardianId, tenantId, deletedAt: null },
    });
    if (!guardian) {
      throw new NotFoundException("guardian not found");
    }

    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId, student: { deletedAt: null } },
      include: { student: { include: { currentClass: true, currentSection: true } } },
    });

    return {
      id: guardian.id,
      full_name: guardian.fullName,
      relation: guardian.relation,
      phone: guardian.phone,
      alt_phone: guardian.altPhone,
      email: guardian.email,
      occupation: guardian.occupation,
      address: guardian.address,
      aadhaar_number: guardian.aadhaarNumber,
      annual_income: guardian.annualIncome,
      children: links.map((l) => ({
        id: l.student.id,
        first_name: l.student.firstName,
        last_name: l.student.lastName,
        admission_number: l.student.admissionNumber,
        class_name: l.student.currentClass?.name ?? null,
        section_name: l.student.currentSection?.name ?? null,
        status: l.student.status,
      })),
    };
  }

  // Links an existing guardian to a student, or creates a new one and
  // links it -- the mechanism siblings share a guardian through.
  async addGuardianToStudent(tenantId: string, actorUserId: string, studentId: string, dto: AddGuardianDto) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, tenantId, deletedAt: null } });
    if (!student) {
      throw new NotFoundException("student not found");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      let guardianId: string;

      if (dto.guardian_id) {
        const guardian = await tx.guardian.findFirst({
          where: { id: dto.guardian_id, tenantId, deletedAt: null },
        });
        if (!guardian) {
          throw new NotFoundException("guardian not found");
        }
        guardianId = guardian.id;

        const existingLink = await tx.studentGuardian.findFirst({ where: { studentId, guardianId } });
        if (existingLink) {
          throw new ConflictException("this guardian is already linked to this student");
        }
      } else {
        guardianId = randomUUID();
        await tx.guardian.create({
          data: {
            id: guardianId,
            tenantId,
            fullName: dto.full_name!,
            relation: dto.relation,
            phone: dto.phone ?? null,
            altPhone: dto.alt_phone ?? null,
            email: dto.email ?? null,
            occupation: dto.occupation ?? null,
            address: dto.address ?? null,
            aadhaarNumber: dto.aadhaar_number ?? null,
            annualIncome: dto.annual_income ?? null,
            updatedAt: now,
            updatedBy: actorUserId,
          },
        });
      }

      if (dto.is_primary_contact) {
        await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimaryContact: false } });
      }

      const studentGuardianId = randomUUID();
      await tx.studentGuardian.create({
        data: {
          id: studentGuardianId,
          tenantId,
          studentId,
          guardianId,
          relation: dto.relation,
          isPrimaryContact: dto.is_primary_contact ?? false,
          updatedAt: now,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: student.branchId,
        actorUserId,
        entityTable: "student_guardians",
        entityId: studentGuardianId,
        action: "create",
        summary: dto.guardian_id ? "Linked existing guardian to student" : "Added new guardian to student",
      });

      return { guardian_id: guardianId, student_guardian_id: studentGuardianId };
    });
  }

  // Creates a student + guardian + student_guardian + admission record in
  // one transaction -- the same vertical slice the old offline-write ->
  // outbox -> sync architecture proved end to end, now a single Postgres
  // transaction instead of a local SQLite write plus a queued outbox row.
  async createAdmission(tenantId: string, actorUserId: string, dto: CreateAdmissionDto) {
    const now = new Date();
    const studentId = randomUUID();
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
          category: dto.category ?? null,
          religion: dto.religion ?? null,
          nationality: dto.nationality ?? null,
          motherTongue: dto.mother_tongue ?? null,
          aadhaarNumber: dto.aadhaar_number ?? null,
          previousSchoolName: dto.previous_school_name ?? null,
          medicalNotes: dto.medical_notes ?? null,
          emergencyContactName: dto.emergency_contact_name ?? null,
          emergencyContactPhone: dto.emergency_contact_phone ?? null,
          updatedAt: now,
        },
      });

      let guardianId: string;
      if (dto.guardian_id) {
        const guardian = await tx.guardian.findFirst({
          where: { id: dto.guardian_id, tenantId, deletedAt: null },
        });
        if (!guardian) {
          throw new NotFoundException("guardian not found");
        }
        guardianId = guardian.id;
      } else {
        guardianId = randomUUID();
        await tx.guardian.create({
          data: {
            id: guardianId,
            tenantId,
            fullName: dto.guardian_name!,
            relation: dto.guardian_relation,
            phone: dto.guardian_phone ?? null,
            altPhone: dto.guardian_alt_phone ?? null,
            email: dto.guardian_email ?? null,
            occupation: dto.guardian_occupation ?? null,
            address: dto.guardian_address ?? null,
            aadhaarNumber: dto.guardian_aadhaar_number ?? null,
            annualIncome: dto.guardian_annual_income ?? null,
            updatedAt: now,
          },
        });
      }

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

      // An explicit fee_structure_ids list (even an empty one) means the
      // admin made real choices on the admission form -- unchecked
      // structures become "exclude" overrides so they're skipped once
      // confirmAdmission actually generates invoices. Omitting the field
      // entirely (undefined) preserves today's behavior: every matching
      // structure applies, exactly as for admissions predating this
      // feature.
      if (dto.fee_structure_ids !== undefined) {
        const matching = await this.feesService.listMatchingStructures(
          tenantId,
          dto.branch_id,
          dto.applied_class_id ?? null,
          dto.academic_session_id,
          tx,
        );
        const keepSet = new Set(dto.fee_structure_ids);
        for (const structure of matching) {
          if (keepSet.has(structure.id)) continue;
          await tx.studentFeeAssignment.create({
            data: {
              id: randomUUID(),
              tenantId,
              branchId: dto.branch_id,
              studentId,
              feeStructureId: structure.id,
              mode: "exclude",
              reason: "Excluded at admission",
              updatedAt: now,
              updatedBy: actorUserId,
            },
          });
        }
      }

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

      // The first moment a student is genuinely fee-eligible (generateInvoices
      // requires status: "enrolled", which this transaction just set) --
      // generate invoices for every matching structure the admin didn't
      // explicitly exclude at admission time. Best-effort: a branch with no
      // current academic session configured shouldn't block confirming the
      // admission itself.
      const student = await tx.student.findUniqueOrThrow({ where: { id: admission.studentId } });
      let currentSessionId: string | null = null;
      try {
        currentSessionId = await this.feesService.resolveCurrentSessionId(tx, tenantId);
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
      }

      if (currentSessionId) {
        const matching = await this.feesService.listMatchingStructures(
          tenantId,
          admission.branchId,
          student.currentClassId,
          currentSessionId,
          tx,
        );
        const excluded = await tx.studentFeeAssignment.findMany({
          where: { studentId: student.id, mode: "exclude", deletedAt: null },
          select: { feeStructureId: true },
        });
        const excludedIds = new Set(excluded.map((e) => e.feeStructureId));

        for (const structure of matching) {
          if (excludedIds.has(structure.id)) continue;
          await this.feesService.generateInvoiceForStudent(tenantId, student.id, structure.id, tx);
        }
      }
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
          rollNumber: dto.roll_number ?? null,
          dateOfBirth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
          gender: dto.gender ?? null,
          bloodGroup: dto.blood_group ?? null,
          currentClassId: dto.current_class_id ?? null,
          currentSectionId: dto.current_section_id ?? null,
          ...(dto.status ? { status: dto.status } : {}),
          address: dto.address ?? null,
          city: dto.city ?? null,
          state: dto.state ?? null,
          pincode: dto.pincode ?? null,
          notes: dto.notes ?? null,
          category: dto.category ?? null,
          religion: dto.religion ?? null,
          nationality: dto.nationality ?? null,
          motherTongue: dto.mother_tongue ?? null,
          aadhaarNumber: dto.aadhaar_number ?? null,
          previousSchoolName: dto.previous_school_name ?? null,
          medicalNotes: dto.medical_notes ?? null,
          emergencyContactName: dto.emergency_contact_name ?? null,
          emergencyContactPhone: dto.emergency_contact_phone ?? null,
          graduationYear: dto.graduation_year ?? null,
          higherEducation: dto.higher_education ?? null,
          currentOccupation: dto.current_occupation ?? null,
          alumniContactEmail: dto.alumni_contact_email ?? null,
          alumniNotes: dto.alumni_notes ?? null,
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

  // Issues (or re-issues the mutable fields of) a Transfer Certificate.
  // Idempotent on the number itself -- called again for the same student it
  // updates reason/date/remark but never regenerates tcNumber once set.
  // Sets status to "withdrawn" unless the student is already "alumni" (a
  // graduating student can still receive a TC without losing alumni status).
  async issueTransferCertificate(
    tenantId: string,
    actorUserId: string,
    studentId: string,
    dto: IssueTransferCertificateDto,
  ) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, tenantId, deletedAt: null } });
    if (!student) {
      throw new NotFoundException("student not found");
    }
    const now = new Date();
    const tcNumber = student.tcNumber ?? generateTcNumber(student.branchId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.student.update({
        where: { id: studentId },
        data: {
          reasonForLeaving: dto.reason_for_leaving,
          dateOfLeaving: new Date(dto.date_of_leaving),
          conductRemark: dto.conduct_remark ?? null,
          tcNumber,
          tcIssueDate: student.tcIssueDate ?? now,
          status: student.status === "alumni" ? student.status : "withdrawn",
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: student.branchId,
        actorUserId,
        entityTable: "students",
        entityId: studentId,
        action: "update",
        summary: `Issued Transfer Certificate ${tcNumber}`,
      });

      return updated;
    });
  }

  async getTransferCertificate(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId, deletedAt: null },
      include: { currentClass: true, currentSection: true },
    });
    if (!student) {
      throw new NotFoundException("student not found");
    }
    const admissions = await this.prisma.admission.findMany({
      where: { studentId, deletedAt: null },
      orderBy: { appliedAt: "asc" },
    });
    const confirmed = admissions.find((a) => a.stage === "enrolled");
    const dateOfAdmission = confirmed?.decidedAt ?? admissions[0]?.appliedAt ?? null;

    return {
      student_id: student.id,
      admission_number: student.admissionNumber,
      first_name: student.firstName,
      last_name: student.lastName,
      date_of_birth: student.dateOfBirth,
      class_name: student.currentClass?.name ?? null,
      section_name: student.currentSection?.name ?? null,
      date_of_admission: dateOfAdmission,
      date_of_leaving: student.dateOfLeaving,
      reason_for_leaving: student.reasonForLeaving,
      conduct_remark: student.conductRemark,
      tc_number: student.tcNumber,
      tc_issue_date: student.tcIssueDate,
      status: student.status,
    };
  }

  async getQrCode(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, tenantId, deletedAt: null } });
    if (!student) {
      throw new NotFoundException("student not found");
    }
    return { token: this.qrToken.generate("student", tenantId, student.id, student.qrCodeVersion) };
  }

  // Bumping qrCodeVersion instantly invalidates every previously-printed
  // code for this student, since verification always checks against the
  // row's current version -- no separate revocation list needed.
  async reissueQrCode(tenantId: string, actorUserId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, tenantId, deletedAt: null } });
    if (!student) {
      throw new NotFoundException("student not found");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.student.update({
        where: { id: studentId },
        data: {
          qrCodeVersion: { increment: 1 },
          updatedAt: new Date(),
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: student.branchId,
        actorUserId,
        entityTable: "students",
        entityId: studentId,
        action: "update",
        summary: "Reissued QR code",
      });

      return { token: this.qrToken.generate("student", tenantId, updated.id, updated.qrCodeVersion) };
    });
  }

  async getQrCodesBulk(tenantId: string, ids: string[]) {
    const students = await this.prisma.student.findMany({ where: { id: { in: ids }, tenantId, deletedAt: null } });
    return students.map((s) => ({
      student_id: s.id,
      token: this.qrToken.generate("student", tenantId, s.id, s.qrCodeVersion),
    }));
  }

  async getPhotoUploadUrl(tenantId: string, studentId: string, fileName: string, contentType: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, tenantId, deletedAt: null } });
    if (!student) {
      throw new NotFoundException("student not found");
    }
    const ext = sanitizePhotoExtension(fileName);
    const key = `photo-student-${randomUUID()}${ext ? `.${ext}` : ""}`;
    const upload = await this.storage.createUploadUrl(key, contentType);
    return { ...upload, storage_key: key };
  }

  // Single slot, not a list -- setting a new photo best-effort deletes the
  // old object (mirrors DocumentsService.remove's storage cleanup, but here
  // it happens as part of the replace rather than a separate delete call).
  async setPhoto(tenantId: string, actorUserId: string, studentId: string, storageKey: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, tenantId, deletedAt: null } });
    if (!student) {
      throw new NotFoundException("student not found");
    }
    const previousPath = student.photoPath;

    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: studentId },
        data: {
          photoPath: storageKey,
          updatedAt: new Date(),
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: student.branchId,
        actorUserId,
        entityTable: "students",
        entityId: studentId,
        action: "update",
        summary: "Updated photo",
      });
    });

    if (previousPath && previousPath !== storageKey) {
      await this.storage.deleteObject(previousPath);
    }

    return { ok: true };
  }

  async getPhotoUrl(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, tenantId, deletedAt: null } });
    if (!student) {
      throw new NotFoundException("student not found");
    }
    if (!student.photoPath) {
      return { url: null };
    }
    return this.storage.createDownloadUrl(student.photoPath);
  }

  async deletePhoto(tenantId: string, actorUserId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, tenantId, deletedAt: null } });
    if (!student) {
      throw new NotFoundException("student not found");
    }
    if (!student.photoPath) {
      return { ok: true };
    }
    const previousPath = student.photoPath;

    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: studentId },
        data: { photoPath: null, updatedAt: new Date(), updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: student.branchId,
        actorUserId,
        entityTable: "students",
        entityId: studentId,
        action: "update",
        summary: "Removed photo",
      });
    });

    await this.storage.deleteObject(previousPath);

    return { ok: true };
  }

  async getPhotoUrlsBulk(tenantId: string, ids: string[]) {
    const students = await this.prisma.student.findMany({
      where: { id: { in: ids }, tenantId, deletedAt: null, photoPath: { not: null } },
    });
    const entries = await Promise.all(
      students.map(async (s) => ({ student_id: s.id, ...(await this.storage.createDownloadUrl(s.photoPath!)) })),
    );
    return entries;
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
          altPhone: dto.alt_phone ?? null,
          email: dto.email ?? null,
          occupation: dto.occupation ?? null,
          address: dto.address ?? null,
          aadhaarNumber: dto.aadhaar_number ?? null,
          annualIncome: dto.annual_income ?? null,
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

  async listElectiveChoices(studentId: string, academicSessionId?: string) {
    const choices = await this.prisma.studentElectiveChoice.findMany({
      where: { studentId, deletedAt: null, ...(academicSessionId ? { academicSessionId } : {}) },
      include: { subject: true, electiveGroup: true },
      orderBy: { electiveGroup: { name: "asc" } },
    });

    return choices.map((c) => ({
      id: c.id,
      elective_group_id: c.electiveGroupId,
      elective_group_name: c.electiveGroup.name,
      subject_id: c.subjectId,
      subject_name: c.subject.name,
      academic_session_id: c.academicSessionId,
    }));
  }

  // Elects (or re-elects, for the same group+session) a subject from an
  // elective group -- the chosen subject must actually be a member of that
  // group, and the group must belong to the student's current class.
  async electSubject(tenantId: string, actorUserId: string, studentId: string, dto: ElectSubjectDto) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, tenantId, deletedAt: null } });
    if (!student) {
      throw new NotFoundException("student not found");
    }

    const group = await this.prisma.subjectElectiveGroup.findFirst({
      where: { id: dto.elective_group_id, tenantId, deletedAt: null },
    });
    if (!group) {
      throw new NotFoundException("elective group not found");
    }
    if (group.classId !== student.currentClassId) {
      throw new ConflictException("this elective group does not belong to the student's current class");
    }

    const membership = await this.prisma.subjectElectiveGroupMember.findFirst({
      where: {
        electiveGroupId: dto.elective_group_id,
        deletedAt: null,
        classSubject: { subjectId: dto.subject_id, deletedAt: null },
      },
    });
    if (!membership) {
      throw new ConflictException("that subject is not offered in this elective group");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const choice = await tx.studentElectiveChoice.upsert({
        where: {
          studentId_electiveGroupId_academicSessionId: {
            studentId,
            electiveGroupId: dto.elective_group_id,
            academicSessionId: dto.academic_session_id,
          },
        },
        create: {
          id: randomUUID(),
          tenantId,
          studentId,
          electiveGroupId: dto.elective_group_id,
          subjectId: dto.subject_id,
          academicSessionId: dto.academic_session_id,
          updatedAt: now,
          updatedBy: actorUserId,
        },
        update: {
          subjectId: dto.subject_id,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: student.branchId,
        actorUserId,
        entityTable: "student_elective_choices",
        entityId: choice.id,
        action: "update",
        summary: "Recorded student elective choice",
      });

      return choice;
    });
  }
}
