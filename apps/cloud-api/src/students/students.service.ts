import { randomUUID } from "node:crypto";

import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { isUniqueViolation } from "../db/pg-errors.js";
import { findOneForTenant, insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import { FeesService } from "../fees/fees.service.js";
import { QrTokenService } from "../qr/qr-token.service.js";
import { StorageService } from "../storage/storage.service.js";
import type { AddGuardianDto } from "./dto/add-guardian.dto.js";
import type { CreateAdmissionDto } from "./dto/create-admission.dto.js";
import type { ElectSubjectDto } from "./dto/elect-subject.dto.js";
import type { IssueTransferCertificateDto } from "./dto/issue-transfer-certificate.dto.js";
import type { UpdateGuardianDto } from "./dto/update-guardian.dto.js";
import type { UpdateStudentDto } from "./dto/update-student.dto.js";

const MAX_ADMISSION_NUMBER_ATTEMPTS = 20;

export interface StudentRow extends TenantRow {
  branch_id: string;
  admission_number: string | null;
  roll_number: string | null;
  first_name: string;
  last_name: string | null;
  date_of_birth: Date | null;
  gender: string | null;
  blood_group: string | null;
  photo_path: string | null;
  current_class_id: string | null;
  current_section_id: string | null;
  status: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  notes: string | null;
  category: string | null;
  religion: string | null;
  nationality: string | null;
  mother_tongue: string | null;
  aadhaar_number: string | null;
  previous_school_name: string | null;
  medical_notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  date_of_leaving: Date | null;
  reason_for_leaving: string | null;
  tc_number: string | null;
  tc_issue_date: Date | null;
  conduct_remark: string | null;
  graduation_year: number | null;
  higher_education: string | null;
  current_occupation: string | null;
  alumni_contact_email: string | null;
  alumni_notes: string | null;
  qr_code_version: number;
}

export interface GuardianRow extends TenantRow {
  full_name: string;
  relation: string | null;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  occupation: string | null;
  address: string | null;
  aadhaar_number: string | null;
  annual_income: number | null;
}

export interface AdmissionRow extends TenantRow {
  branch_id: string;
  student_id: string;
  applied_class_id: string | null;
  academic_session_id: string;
  stage: string;
  applied_at: Date;
  decided_at: Date | null;
  decided_by: string | null;
}

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
    private readonly db: DbService,
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
    const conditions = ["s.tenant_id = $1", "s.branch_id = $2", "s.deleted_at IS NULL"];
    const values: unknown[] = [tenantId, branchId];

    if (filters?.status) {
      values.push(filters.status);
      conditions.push(`s.status = $${values.length}`);
    }
    if (filters?.classId) {
      values.push(filters.classId);
      conditions.push(`s.current_class_id = $${values.length}`);
    }
    if (filters?.sectionId) {
      values.push(filters.sectionId);
      conditions.push(`s.current_section_id = $${values.length}`);
    }
    if (filters?.gender) {
      values.push(filters.gender);
      conditions.push(`s.gender = $${values.length}`);
    }
    if (term) {
      values.push(`%${term}%`);
      const p = values.length;
      conditions.push(`(s.first_name ILIKE $${p} OR s.last_name ILIKE $${p} OR s.admission_number ILIKE $${p})`);
    }

    const rows = await this.db.query<
      StudentRow & { class_name: string | null; section_name: string | null }
    >(
      tenantId,
      `SELECT s.*, c.name AS class_name, sec.name AS section_name
       FROM students s
       LEFT JOIN classes c ON c.id = s.current_class_id
       LEFT JOIN sections sec ON sec.id = s.current_section_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY s.first_name ASC`,
      values,
    );

    return rows.map((s) => ({
      id: s.id,
      admission_number: s.admission_number,
      roll_number: s.roll_number,
      first_name: s.first_name,
      last_name: s.last_name,
      status: s.status,
      class_name: s.class_name,
      section_name: s.section_name,
      graduation_year: s.graduation_year,
      higher_education: s.higher_education,
      current_occupation: s.current_occupation,
    }));
  }

  async listStudentsInClass(tenantId: string, classId: string) {
    const rows = await this.db.query<StudentRow & { class_name: string | null; section_name: string | null }>(
      tenantId,
      `SELECT s.*, c.name AS class_name, sec.name AS section_name
       FROM students s
       LEFT JOIN classes c ON c.id = s.current_class_id
       LEFT JOIN sections sec ON sec.id = s.current_section_id
       WHERE s.tenant_id = $1 AND s.current_class_id = $2 AND s.deleted_at IS NULL AND s.status = 'enrolled'
       ORDER BY s.first_name ASC`,
      [tenantId, classId],
    );

    return rows.map((s) => ({
      id: s.id,
      admission_number: s.admission_number,
      roll_number: s.roll_number,
      first_name: s.first_name,
      last_name: s.last_name,
      status: s.status,
      class_name: s.class_name,
      section_name: s.section_name,
    }));
  }

  async getStudent(tenantId: string, id: string) {
    const student = await this.db.queryOne<StudentRow & { class_name: string | null; section_name: string | null }>(
      tenantId,
      `SELECT s.*, c.name AS class_name, sec.name AS section_name
       FROM students s
       LEFT JOIN classes c ON c.id = s.current_class_id
       LEFT JOIN sections sec ON sec.id = s.current_section_id
       WHERE s.tenant_id = $1 AND s.id = $2 AND s.deleted_at IS NULL`,
      [tenantId, id],
    );
    if (!student) {
      throw new NotFoundException("student not found");
    }

    const guardianRows = await this.db.query<
      GuardianRow & { is_primary_contact: boolean }
    >(
      tenantId,
      `SELECT g.*, sg.is_primary_contact
       FROM student_guardians sg
       JOIN guardians g ON g.id = sg.guardian_id
       WHERE sg.tenant_id = $1 AND sg.student_id = $2 AND g.deleted_at IS NULL`,
      [tenantId, id],
    );

    return {
      id: student.id,
      tenant_id: student.tenant_id,
      branch_id: student.branch_id,
      admission_number: student.admission_number,
      roll_number: student.roll_number,
      first_name: student.first_name,
      last_name: student.last_name,
      date_of_birth: student.date_of_birth,
      gender: student.gender,
      blood_group: student.blood_group,
      current_class_id: student.current_class_id,
      current_section_id: student.current_section_id,
      class_name: student.class_name,
      section_name: student.section_name,
      status: student.status,
      address: student.address,
      city: student.city,
      state: student.state,
      pincode: student.pincode,
      notes: student.notes,
      category: student.category,
      religion: student.religion,
      nationality: student.nationality,
      mother_tongue: student.mother_tongue,
      aadhaar_number: student.aadhaar_number,
      previous_school_name: student.previous_school_name,
      medical_notes: student.medical_notes,
      emergency_contact_name: student.emergency_contact_name,
      emergency_contact_phone: student.emergency_contact_phone,
      date_of_leaving: student.date_of_leaving,
      reason_for_leaving: student.reason_for_leaving,
      tc_number: student.tc_number,
      tc_issue_date: student.tc_issue_date,
      conduct_remark: student.conduct_remark,
      graduation_year: student.graduation_year,
      higher_education: student.higher_education,
      current_occupation: student.current_occupation,
      alumni_contact_email: student.alumni_contact_email,
      alumni_notes: student.alumni_notes,
      updated_at: student.updated_at,
      version: student.version,
      guardians: guardianRows.map((g) => ({
        id: g.id,
        full_name: g.full_name,
        relation: g.relation,
        phone: g.phone,
        alt_phone: g.alt_phone,
        email: g.email,
        occupation: g.occupation,
        address: g.address,
        aadhaar_number: g.aadhaar_number,
        annual_income: g.annual_income,
        is_primary_contact: g.is_primary_contact,
      })),
    };
  }

  // Other enrolled students who share at least one guardian with this
  // student -- de-duplicated since two students can share more than one
  // guardian (e.g. both a father and mother in common).
  async getSiblings(tenantId: string, studentId: string) {
    const guardianIdRows = await this.db.query<{ guardian_id: string }>(
      tenantId,
      "SELECT guardian_id FROM student_guardians WHERE tenant_id = $1 AND student_id = $2",
      [tenantId, studentId],
    );
    const guardianIds = guardianIdRows.map((r) => r.guardian_id);
    if (guardianIds.length === 0) {
      return [];
    }

    const rows = await this.db.query<
      Pick<StudentRow, "id" | "first_name" | "last_name" | "admission_number"> & {
        class_name: string | null;
        section_name: string | null;
      }
    >(
      tenantId,
      `SELECT DISTINCT s.id, s.first_name, s.last_name, s.admission_number, c.name AS class_name, sec.name AS section_name
       FROM student_guardians sg
       JOIN students s ON s.id = sg.student_id
       LEFT JOIN classes c ON c.id = s.current_class_id
       LEFT JOIN sections sec ON sec.id = s.current_section_id
       WHERE sg.tenant_id = $1 AND sg.guardian_id = ANY($2) AND sg.student_id != $3
         AND s.deleted_at IS NULL AND s.status = 'enrolled'`,
      [tenantId, guardianIds, studentId],
    );

    return rows.map((s) => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      admission_number: s.admission_number,
      class_name: s.class_name,
      section_name: s.section_name,
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

    const guardians = await this.db.query<GuardianRow>(
      tenantId,
      `SELECT * FROM guardians
       WHERE tenant_id = $1 AND deleted_at IS NULL AND (phone ILIKE $2 OR full_name ILIKE $2)
       LIMIT 20`,
      [tenantId, `%${term}%`],
    );
    if (guardians.length === 0) {
      return [];
    }

    const links = await this.db.query<{
      guardian_id: string;
      id: string;
      first_name: string;
      last_name: string | null;
      class_name: string | null;
    }>(
      tenantId,
      `SELECT sg.guardian_id, s.id, s.first_name, s.last_name, c.name AS class_name
       FROM student_guardians sg
       JOIN students s ON s.id = sg.student_id
       LEFT JOIN classes c ON c.id = s.current_class_id
       WHERE sg.tenant_id = $1 AND sg.guardian_id = ANY($2) AND s.deleted_at IS NULL`,
      [tenantId, guardians.map((g) => g.id)],
    );
    const byGuardian = new Map<string, typeof links>();
    for (const link of links) {
      const list = byGuardian.get(link.guardian_id) ?? [];
      list.push(link);
      byGuardian.set(link.guardian_id, list);
    }

    return guardians.map((g) => ({
      id: g.id,
      full_name: g.full_name,
      relation: g.relation,
      phone: g.phone,
      alt_phone: g.alt_phone,
      email: g.email,
      occupation: g.occupation,
      address: g.address,
      aadhaar_number: g.aadhaar_number,
      annual_income: g.annual_income,
      linked_students: (byGuardian.get(g.id) ?? []).map((sg) => ({
        id: sg.id,
        name: [sg.first_name, sg.last_name].filter(Boolean).join(" "),
        class_name: sg.class_name,
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
    const guardian = await this.db.queryOne<GuardianRow>(
      tenantId,
      "SELECT * FROM guardians WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
      [tenantId, guardianId],
    );
    if (!guardian) {
      throw new NotFoundException("guardian not found");
    }

    const children = await this.db.query<{
      id: string;
      first_name: string;
      last_name: string | null;
      admission_number: string | null;
      status: string;
      class_name: string | null;
      section_name: string | null;
    }>(
      tenantId,
      `SELECT s.id, s.first_name, s.last_name, s.admission_number, s.status, c.name AS class_name, sec.name AS section_name
       FROM student_guardians sg
       JOIN students s ON s.id = sg.student_id
       LEFT JOIN classes c ON c.id = s.current_class_id
       LEFT JOIN sections sec ON sec.id = s.current_section_id
       WHERE sg.tenant_id = $1 AND sg.guardian_id = $2 AND s.deleted_at IS NULL`,
      [tenantId, guardianId],
    );

    return {
      id: guardian.id,
      full_name: guardian.full_name,
      relation: guardian.relation,
      phone: guardian.phone,
      alt_phone: guardian.alt_phone,
      email: guardian.email,
      occupation: guardian.occupation,
      address: guardian.address,
      aadhaar_number: guardian.aadhaar_number,
      annual_income: guardian.annual_income,
      children,
    };
  }

  // Links an existing guardian to a student, or creates a new one and
  // links it -- the mechanism siblings share a guardian through.
  async addGuardianToStudent(tenantId: string, actorUserId: string, studentId: string, dto: AddGuardianDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const student = await findOneForTenant<StudentRow>(client, "students", tenantId, studentId);
      if (!student) {
        throw new NotFoundException("student not found");
      }

      const now = new Date();
      let guardianId: string;

      if (dto.guardian_id) {
        const guardian = await findOneForTenant<GuardianRow>(client, "guardians", tenantId, dto.guardian_id);
        if (!guardian) {
          throw new NotFoundException("guardian not found");
        }
        guardianId = guardian.id;

        const existingLink = await client.query(
          "SELECT 1 FROM student_guardians WHERE tenant_id = $1 AND student_id = $2 AND guardian_id = $3",
          [tenantId, studentId, guardianId],
        );
        if (existingLink.rows.length > 0) {
          throw new ConflictException("this guardian is already linked to this student");
        }
      } else {
        const guardian = await insertRow<GuardianRow>(client, "guardians", tenantId, {
          full_name: dto.full_name!,
          relation: dto.relation,
          phone: dto.phone ?? null,
          alt_phone: dto.alt_phone ?? null,
          email: dto.email ?? null,
          occupation: dto.occupation ?? null,
          address: dto.address ?? null,
          aadhaar_number: dto.aadhaar_number ?? null,
          annual_income: dto.annual_income ?? null,
          updated_at: now,
          updated_by: actorUserId,
        });
        guardianId = guardian.id;
      }

      if (dto.is_primary_contact) {
        await client.query(
          "UPDATE student_guardians SET is_primary_contact = false WHERE tenant_id = $1 AND student_id = $2",
          [tenantId, studentId],
        );
      }

      const studentGuardianId = randomUUID();
      await client.query(
        `INSERT INTO student_guardians (id, tenant_id, student_id, guardian_id, relation, is_primary_contact, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [studentGuardianId, tenantId, studentId, guardianId, dto.relation, dto.is_primary_contact ?? false, now],
      );

      await this.audit.record(client, {
        tenantId,
        branchId: student.branch_id,
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
  //
  // The optional fee_structure_ids exclusion step runs in its own separate
  // transaction immediately after this one commits (mirroring
  // confirmAdmission's fee-generation step below) -- reading the matching
  // structures needs the student/admission row to already exist, so it
  // can't be folded into the transaction above without restructuring the
  // read-then-write flow. A crash in the narrow window between the two
  // isn't atomic; a partial failure here just means an admin may need to
  // re-apply the fee exclusions by hand, not silent data corruption.
  async createAdmission(tenantId: string, actorUserId: string, dto: CreateAdmissionDto) {
    const result = await this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      const student = await insertRow<StudentRow>(client, "students", tenantId, {
        branch_id: dto.branch_id,
        first_name: dto.first_name,
        last_name: dto.last_name ?? null,
        date_of_birth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
        gender: dto.gender ?? null,
        current_class_id: dto.applied_class_id ?? null,
        status: "applied",
        address: dto.address ?? null,
        category: dto.category ?? null,
        religion: dto.religion ?? null,
        nationality: dto.nationality ?? null,
        mother_tongue: dto.mother_tongue ?? null,
        aadhaar_number: dto.aadhaar_number ?? null,
        previous_school_name: dto.previous_school_name ?? null,
        medical_notes: dto.medical_notes ?? null,
        emergency_contact_name: dto.emergency_contact_name ?? null,
        emergency_contact_phone: dto.emergency_contact_phone ?? null,
        updated_at: now,
      });

      let guardianId: string;
      if (dto.guardian_id) {
        const guardian = await findOneForTenant<GuardianRow>(client, "guardians", tenantId, dto.guardian_id);
        if (!guardian) {
          throw new NotFoundException("guardian not found");
        }
        guardianId = guardian.id;
      } else {
        const guardian = await insertRow<GuardianRow>(client, "guardians", tenantId, {
          full_name: dto.guardian_name!,
          relation: dto.guardian_relation,
          phone: dto.guardian_phone ?? null,
          alt_phone: dto.guardian_alt_phone ?? null,
          email: dto.guardian_email ?? null,
          occupation: dto.guardian_occupation ?? null,
          address: dto.guardian_address ?? null,
          aadhaar_number: dto.guardian_aadhaar_number ?? null,
          annual_income: dto.guardian_annual_income ?? null,
          updated_at: now,
        });
        guardianId = guardian.id;
      }

      await client.query(
        `INSERT INTO student_guardians (id, tenant_id, student_id, guardian_id, relation, is_primary_contact, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), tenantId, student.id, guardianId, dto.guardian_relation, true, now],
      );

      const admission = await insertRow<AdmissionRow>(client, "admissions", tenantId, {
        branch_id: dto.branch_id,
        student_id: student.id,
        applied_class_id: dto.applied_class_id ?? null,
        academic_session_id: dto.academic_session_id,
        stage: "applied",
        applied_at: now,
        updated_at: now,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "admissions",
        entityId: admission.id,
        action: "create",
        summary: "New admission enquiry",
      });

      return {
        id: admission.id,
        student_id: student.id,
        branch_id: admission.branch_id,
        stage: admission.stage,
        applied_at: admission.applied_at,
      };
    });

    // An explicit fee_structure_ids list (even an empty one) means the
    // admin made real choices on the admission form -- unchecked
    // structures become "exclude" overrides so they're skipped once
    // confirmAdmission actually generates invoices. Omitting the field
    // entirely (undefined) preserves today's behavior: every matching
    // structure applies, exactly as for admissions predating this feature.
    if (dto.fee_structure_ids !== undefined) {
      const matching = await this.feesService.listMatchingStructures(
        tenantId,
        dto.branch_id,
        dto.applied_class_id ?? null,
        dto.academic_session_id,
      );
      const keepSet = new Set(dto.fee_structure_ids);
      const toExclude = matching.filter((structure) => !keepSet.has(structure.id));
      if (toExclude.length > 0) {
        await this.db.withTransaction(tenantId, async (client) => {
          for (const structure of toExclude) {
            await insertRow(client, "student_fee_assignments", tenantId, {
              branch_id: dto.branch_id,
              student_id: result.student_id,
              fee_structure_id: structure.id,
              mode: "exclude",
              reason: "Excluded at admission",
              updated_at: new Date(),
              updated_by: actorUserId,
            });
          }
        });
      }
    }

    return result;
  }

  async getAdmissionForStudent(tenantId: string, studentId: string) {
    const admission = await this.db.queryOne<AdmissionRow>(
      tenantId,
      "SELECT * FROM admissions WHERE tenant_id = $1 AND student_id = $2 AND deleted_at IS NULL",
      [tenantId, studentId],
    );
    if (!admission) {
      return null;
    }
    return {
      id: admission.id,
      student_id: admission.student_id,
      branch_id: admission.branch_id,
      stage: admission.stage,
      applied_at: admission.applied_at,
    };
  }

  // Assigns a real, branch+year-scoped, sequential admission number
  // (MAIN-2026-0001) and flips the student to `enrolled`. Postgres is now
  // the single source of truth (no more per-device SQLite), so concurrent
  // confirms from different clients are a real possibility -- the bounded
  // retry loop against the UNIQUE (tenant_id, admission_number) constraint
  // absorbs that race exactly like the old same-device retry did.
  //
  // Invoice generation (below) runs in its own transaction(s) after the pg
  // transaction that confirms the admission commits -- see the note on
  // createAdmission. A missing current session doesn't block confirming
  // the admission itself.
  async confirmAdmission(tenantId: string, actorUserId: string, admissionId: string) {
    const admission = await this.db.queryOne<AdmissionRow>(
      tenantId,
      "SELECT * FROM admissions WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
      [tenantId, admissionId],
    );
    if (!admission) {
      throw new NotFoundException("admission not found");
    }

    const branch = await this.db.queryOne<{ code: string }>(
      tenantId,
      "SELECT code FROM branches WHERE tenant_id = $1 AND id = $2",
      [tenantId, admission.branch_id],
    );
    if (!branch) {
      throw new NotFoundException("branch not found");
    }
    const year = new Date().getUTCFullYear().toString();
    const prefix = `${branch.code}-${year}-`;

    const [{ count }] = await this.db.query<{ count: string }>(
      tenantId,
      "SELECT count(*) FROM students WHERE tenant_id = $1 AND admission_number LIKE $2",
      [tenantId, `${prefix}%`],
    );
    let nextSeq = Number(count) + 1;
    let admissionNumber: string | undefined;

    await this.db.withTransaction(tenantId, async (client) => {
      for (let attempt = 1; attempt <= MAX_ADMISSION_NUMBER_ATTEMPTS; attempt++) {
        const candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
        try {
          await client.query("SAVEPOINT admission_number_attempt");
          await updateRow<StudentRow>(client, "students", tenantId, admission.student_id, {
            admission_number: candidate,
            status: "enrolled",
            updated_at: new Date(),
          });
          await client.query("RELEASE SAVEPOINT admission_number_attempt");
          admissionNumber = candidate;
          break;
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT admission_number_attempt");
          if (!isUniqueViolation(error)) {
            throw error;
          }
          nextSeq += 1;
        }
      }

      if (!admissionNumber) {
        throw new ConflictException("could not allocate an admission number, please retry");
      }

      const now = new Date();
      await updateRow<AdmissionRow>(client, "admissions", tenantId, admissionId, {
        stage: "enrolled",
        decided_at: now,
        decided_by: actorUserId,
        updated_at: now,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "admissions",
        entityId: admissionId,
        action: "update",
        summary: `Confirmed admission, assigned number ${admissionNumber}`,
      });
    });

    // The first moment a student is genuinely fee-eligible (generateInvoices
    // requires status: "enrolled", which the transaction above just set) --
    // generate invoices for every matching structure the admin didn't
    // explicitly exclude at admission time. Best-effort: a branch with no
    // current academic session configured shouldn't block confirming the
    // admission itself.
    const student = await this.db.queryOne<StudentRow>(
      tenantId,
      "SELECT * FROM students WHERE tenant_id = $1 AND id = $2",
      [tenantId, admission.student_id],
    );
    let currentSessionId: string | null = null;
    try {
      currentSessionId = await this.feesService.resolveCurrentSessionId(tenantId);
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
    }

    if (currentSessionId && student) {
      const matching = await this.feesService.listMatchingStructures(
        tenantId,
        admission.branch_id,
        student.current_class_id,
        currentSessionId,
      );
      const excludedRows = await this.db.query<{ fee_structure_id: string }>(
        tenantId,
        "SELECT fee_structure_id FROM student_fee_assignments WHERE tenant_id = $1 AND student_id = $2 AND mode = 'exclude' AND deleted_at IS NULL",
        [tenantId, student.id],
      );
      const excludedIds = new Set(excludedRows.map((e) => e.fee_structure_id));

      for (const structure of matching) {
        if (excludedIds.has(structure.id)) continue;
        await this.db.withTransaction(tenantId, (client) =>
          this.feesService.generateInvoiceForStudent(tenantId, student.id, structure.id, client),
        );
      }
    }

    return {
      admission_id: admissionId,
      student_id: admission.student_id,
      admission_number: admissionNumber,
      stage: "enrolled",
    };
  }

  async updateStudent(tenantId: string, actorUserId: string, id: string, dto: UpdateStudentDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<StudentRow>(client, "students", tenantId, id, {
        first_name: dto.first_name,
        last_name: dto.last_name ?? null,
        roll_number: dto.roll_number ?? null,
        date_of_birth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
        gender: dto.gender ?? null,
        blood_group: dto.blood_group ?? null,
        current_class_id: dto.current_class_id ?? null,
        current_section_id: dto.current_section_id ?? null,
        ...(dto.status ? { status: dto.status } : {}),
        address: dto.address ?? null,
        city: dto.city ?? null,
        state: dto.state ?? null,
        pincode: dto.pincode ?? null,
        notes: dto.notes ?? null,
        category: dto.category ?? null,
        religion: dto.religion ?? null,
        nationality: dto.nationality ?? null,
        mother_tongue: dto.mother_tongue ?? null,
        aadhaar_number: dto.aadhaar_number ?? null,
        previous_school_name: dto.previous_school_name ?? null,
        medical_notes: dto.medical_notes ?? null,
        emergency_contact_name: dto.emergency_contact_name ?? null,
        emergency_contact_phone: dto.emergency_contact_phone ?? null,
        graduation_year: dto.graduation_year ?? null,
        higher_education: dto.higher_education ?? null,
        current_occupation: dto.current_occupation ?? null,
        alumni_contact_email: dto.alumni_contact_email ?? null,
        alumni_notes: dto.alumni_notes ?? null,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
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
    return this.db.withTransaction(tenantId, async (client) => {
      const student = await findOneForTenant<StudentRow>(client, "students", tenantId, studentId);
      if (!student) {
        throw new NotFoundException("student not found");
      }
      const now = new Date();
      const tcNumber = student.tc_number ?? generateTcNumber(student.branch_id);

      const updated = await updateRow<StudentRow>(client, "students", tenantId, studentId, {
        reason_for_leaving: dto.reason_for_leaving,
        date_of_leaving: new Date(dto.date_of_leaving),
        conduct_remark: dto.conduct_remark ?? null,
        tc_number: tcNumber,
        tc_issue_date: student.tc_issue_date ?? now,
        status: student.status === "alumni" ? student.status : "withdrawn",
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: student.branch_id,
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
    const student = await this.db.queryOne<StudentRow & { class_name: string | null; section_name: string | null }>(
      tenantId,
      `SELECT s.*, c.name AS class_name, sec.name AS section_name
       FROM students s
       LEFT JOIN classes c ON c.id = s.current_class_id
       LEFT JOIN sections sec ON sec.id = s.current_section_id
       WHERE s.tenant_id = $1 AND s.id = $2 AND s.deleted_at IS NULL`,
      [tenantId, studentId],
    );
    if (!student) {
      throw new NotFoundException("student not found");
    }
    const admissions = await this.db.query<AdmissionRow>(
      tenantId,
      "SELECT * FROM admissions WHERE tenant_id = $1 AND student_id = $2 AND deleted_at IS NULL ORDER BY applied_at ASC",
      [tenantId, studentId],
    );
    const confirmed = admissions.find((a) => a.stage === "enrolled");
    const dateOfAdmission = confirmed?.decided_at ?? admissions[0]?.applied_at ?? null;

    return {
      student_id: student.id,
      admission_number: student.admission_number,
      first_name: student.first_name,
      last_name: student.last_name,
      date_of_birth: student.date_of_birth,
      class_name: student.class_name,
      section_name: student.section_name,
      date_of_admission: dateOfAdmission,
      date_of_leaving: student.date_of_leaving,
      reason_for_leaving: student.reason_for_leaving,
      conduct_remark: student.conduct_remark,
      tc_number: student.tc_number,
      tc_issue_date: student.tc_issue_date,
      status: student.status,
    };
  }

  async getQrCode(tenantId: string, studentId: string) {
    const student = await this.db.queryOne<StudentRow>(
      tenantId,
      "SELECT * FROM students WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
      [tenantId, studentId],
    );
    if (!student) {
      throw new NotFoundException("student not found");
    }
    return { token: this.qrToken.generate("student", tenantId, student.id, student.qr_code_version) };
  }

  // Bumping qrCodeVersion instantly invalidates every previously-printed
  // code for this student, since verification always checks against the
  // row's current version -- no separate revocation list needed.
  async reissueQrCode(tenantId: string, actorUserId: string, studentId: string) {
    return this.db.withTransaction(tenantId, async (client) => {
      const student = await findOneForTenant<StudentRow>(client, "students", tenantId, studentId);
      if (!student) {
        throw new NotFoundException("student not found");
      }

      const updated = await client.query<StudentRow>(
        `UPDATE students SET qr_code_version = qr_code_version + 1, updated_at = $1, updated_by = $2, version = version + 1
         WHERE tenant_id = $3 AND id = $4 RETURNING *`,
        [new Date(), actorUserId, tenantId, studentId],
      );
      const row = updated.rows[0]!;

      await this.audit.record(client, {
        tenantId,
        branchId: student.branch_id,
        actorUserId,
        entityTable: "students",
        entityId: studentId,
        action: "update",
        summary: "Reissued QR code",
      });

      return { token: this.qrToken.generate("student", tenantId, row.id, row.qr_code_version) };
    });
  }

  async getQrCodesBulk(tenantId: string, ids: string[]) {
    const students = await this.db.query<StudentRow>(
      tenantId,
      "SELECT * FROM students WHERE tenant_id = $1 AND id = ANY($2) AND deleted_at IS NULL",
      [tenantId, ids],
    );
    return students.map((s) => ({
      student_id: s.id,
      token: this.qrToken.generate("student", tenantId, s.id, s.qr_code_version),
    }));
  }

  async getPhotoUploadUrl(tenantId: string, studentId: string, fileName: string, contentType: string) {
    const student = await this.db.queryOne<StudentRow>(
      tenantId,
      "SELECT * FROM students WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
      [tenantId, studentId],
    );
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
    const previousPath = await this.db.withTransaction(tenantId, async (client) => {
      const student = await findOneForTenant<StudentRow>(client, "students", tenantId, studentId);
      if (!student) {
        throw new NotFoundException("student not found");
      }

      await updateRow<StudentRow>(client, "students", tenantId, studentId, {
        photo_path: storageKey,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: student.branch_id,
        actorUserId,
        entityTable: "students",
        entityId: studentId,
        action: "update",
        summary: "Updated photo",
      });

      return student.photo_path;
    });

    if (previousPath && previousPath !== storageKey) {
      await this.storage.deleteObject(previousPath);
    }

    return { ok: true };
  }

  async getPhotoUrl(tenantId: string, studentId: string) {
    const student = await this.db.queryOne<StudentRow>(
      tenantId,
      "SELECT * FROM students WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
      [tenantId, studentId],
    );
    if (!student) {
      throw new NotFoundException("student not found");
    }
    if (!student.photo_path) {
      return { url: null };
    }
    return this.storage.createDownloadUrl(student.photo_path);
  }

  async deletePhoto(tenantId: string, actorUserId: string, studentId: string) {
    const previousPath = await this.db.withTransaction(tenantId, async (client) => {
      const student = await findOneForTenant<StudentRow>(client, "students", tenantId, studentId);
      if (!student) {
        throw new NotFoundException("student not found");
      }
      if (!student.photo_path) {
        return null;
      }

      await updateRow<StudentRow>(client, "students", tenantId, studentId, {
        photo_path: null,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: student.branch_id,
        actorUserId,
        entityTable: "students",
        entityId: studentId,
        action: "update",
        summary: "Removed photo",
      });

      return student.photo_path;
    });

    if (previousPath) {
      await this.storage.deleteObject(previousPath);
    }

    return { ok: true };
  }

  async getPhotoUrlsBulk(tenantId: string, ids: string[]) {
    const students = await this.db.query<StudentRow>(
      tenantId,
      "SELECT * FROM students WHERE tenant_id = $1 AND id = ANY($2) AND deleted_at IS NULL AND photo_path IS NOT NULL",
      [tenantId, ids],
    );
    const entries = await Promise.all(
      students.map(async (s) => ({ student_id: s.id, ...(await this.storage.createDownloadUrl(s.photo_path!)) })),
    );
    return entries;
  }

  // Soft-delete only; a student leaving the school normally goes through
  // updateStudent (status = withdrawn/alumni) instead, which preserves
  // their attendance/fee/exam history. Deletion is for data-entry mistakes.
  async deleteStudent(tenantId: string, actorUserId: string, id: string) {
    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      const deleted = await updateRow<StudentRow>(client, "students", tenantId, id, {
        deleted_at: now,
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
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
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<GuardianRow>(client, "guardians", tenantId, id);
      if (!existing) {
        throw new NotFoundException("guardian not found");
      }

      const updated = await updateRow<GuardianRow>(client, "guardians", tenantId, id, {
        full_name: dto.full_name,
        relation: dto.relation ?? null,
        phone: dto.phone ?? null,
        alt_phone: dto.alt_phone ?? null,
        email: dto.email ?? null,
        occupation: dto.occupation ?? null,
        address: dto.address ?? null,
        aadhaar_number: dto.aadhaar_number ?? null,
        annual_income: dto.annual_income ?? null,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
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

  async listElectiveChoices(tenantId: string, studentId: string, academicSessionId?: string) {
    const conditions = ["c.tenant_id = $1", "c.student_id = $2", "c.deleted_at IS NULL"];
    const values: unknown[] = [tenantId, studentId];
    if (academicSessionId) {
      values.push(academicSessionId);
      conditions.push(`c.academic_session_id = $${values.length}`);
    }

    const rows = await this.db.query<{
      id: string;
      elective_group_id: string;
      elective_group_name: string;
      subject_id: string;
      subject_name: string;
      academic_session_id: string;
    }>(
      tenantId,
      `SELECT c.id, c.elective_group_id, eg.name AS elective_group_name, c.subject_id, sub.name AS subject_name, c.academic_session_id
       FROM student_elective_choices c
       JOIN subject_elective_groups eg ON eg.id = c.elective_group_id
       JOIN subjects sub ON sub.id = c.subject_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY eg.name ASC`,
      values,
    );

    return rows;
  }

  // Elects (or re-elects, for the same group+session) a subject from an
  // elective group -- the chosen subject must actually be a member of that
  // group, and the group must belong to the student's current class.
  async electSubject(tenantId: string, actorUserId: string, studentId: string, dto: ElectSubjectDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const student = await findOneForTenant<StudentRow>(client, "students", tenantId, studentId);
      if (!student) {
        throw new NotFoundException("student not found");
      }

      const group = await client.query<{ id: string; class_id: string }>(
        "SELECT id, class_id FROM subject_elective_groups WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
        [tenantId, dto.elective_group_id],
      );
      const groupRow = group.rows[0];
      if (!groupRow) {
        throw new NotFoundException("elective group not found");
      }
      if (groupRow.class_id !== student.current_class_id) {
        throw new ConflictException("this elective group does not belong to the student's current class");
      }

      const membership = await client.query(
        `SELECT 1 FROM subject_elective_group_members m
         JOIN class_subjects cs ON cs.id = m.class_subject_id
         WHERE m.tenant_id = $1 AND m.elective_group_id = $2 AND m.deleted_at IS NULL
           AND cs.subject_id = $3 AND cs.deleted_at IS NULL`,
        [tenantId, dto.elective_group_id, dto.subject_id],
      );
      if (membership.rows.length === 0) {
        throw new ConflictException("that subject is not offered in this elective group");
      }

      const now = new Date();
      const result = await client.query<{
        id: string;
      }>(
        `INSERT INTO student_elective_choices
           (id, tenant_id, student_id, elective_group_id, subject_id, academic_session_id, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (student_id, elective_group_id, academic_session_id)
         DO UPDATE SET subject_id = EXCLUDED.subject_id, updated_at = EXCLUDED.updated_at,
           updated_by = EXCLUDED.updated_by, version = student_elective_choices.version + 1
         RETURNING id`,
        [randomUUID(), tenantId, studentId, dto.elective_group_id, dto.subject_id, dto.academic_session_id, now, actorUserId],
      );
      const choiceId = result.rows[0]!.id;

      await this.audit.record(client, {
        tenantId,
        branchId: student.branch_id,
        actorUserId,
        entityTable: "student_elective_choices",
        entityId: choiceId,
        action: "update",
        summary: "Recorded student elective choice",
      });

      return { id: choiceId };
    });
  }
}
