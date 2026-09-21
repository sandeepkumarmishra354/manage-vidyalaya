import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { CONSENT_VERSION } from "../common/consent.js";
import { PlanLimitsService } from "../common/plan-limits.service.js";
import { DbService } from "../db/db.service.js";
import { isUniqueViolation } from "../db/pg-errors.js";
import { findOneForTenant, insertRow, softDeleteRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import { QrTokenService } from "../qr/qr-token.service.js";
import { StorageService } from "../storage/storage.service.js";
import type { CreateStaffDto } from "./dto/create-staff.dto.js";
import type { CreateTeacherAssignmentDto } from "./dto/create-teacher-assignment.dto.js";
import type { IssueExperienceLetterDto } from "./dto/issue-experience-letter.dto.js";
import type { SetClassTeacherDto } from "./dto/set-class-teacher.dto.js";
import type { SetStaffStatusDto } from "./dto/set-staff-status.dto.js";
import type { UpdateStaffDto } from "./dto/update-staff.dto.js";

export interface StaffRow extends TenantRow {
  branch_id: string;
  user_id: string | null;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  date_of_birth: Date | null;
  gender: string | null;
  phone: string | null;
  personal_email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  designation: string;
  department: string | null;
  category_id: string | null;
  employment_type: string;
  date_of_joining: Date;
  date_of_leaving: Date | null;
  status: string;
  qualification: string | null;
  blood_group: string | null;
  photo_path: string | null;
  signature_url: string | null;
  is_principal: boolean;
  pan_number: string | null;
  aadhaar_number: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  pf_number: string | null;
  esi_number: string | null;
  uan_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  reason_for_leaving: string | null;
  experience_letter_number: string | null;
  experience_letter_issue_date: Date | null;
  conduct_remark: string | null;
  qr_code_version: number;
  consent_given: boolean;
  consent_given_at: Date | null;
  consent_version: string | null;
}

interface BranchRow extends TenantRow {
  code: string;
}

export interface TeacherAssignmentRow extends TenantRow {
  branch_id: string;
  staff_id: string;
  class_id: string;
  section_id: string | null;
  subject_id: string;
  academic_session_id: string;
}

function toDateOrNull(value?: string | null) {
  return value ? new Date(value) : null;
}

// Same convention as generateReceiptNumber/generateTcNumber elsewhere.
function generateExperienceLetterNumber(branchId: string): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `EXP-${branchId.slice(0, 4).toUpperCase()}-${datePart}-${rand}`;
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

@Injectable()
export class StaffService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly qrToken: QrTokenService,
    private readonly storage: StorageService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async listStaff(
    tenantId: string,
    branchId: string,
    search?: string,
    filters?: {
      categoryId?: string;
      department?: string;
      status?: string;
      fromDate?: string;
      toDate?: string;
    },
  ) {
    const term = (search ?? "").trim();
    const conditions = ["tenant_id = $1", "branch_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [tenantId, branchId];

    if (filters?.categoryId) {
      values.push(filters.categoryId);
      conditions.push(`category_id = $${values.length}`);
    }
    if (filters?.department) {
      values.push(filters.department);
      conditions.push(`department = $${values.length}`);
    }
    if (filters?.status) {
      values.push(filters.status);
      conditions.push(`status = $${values.length}`);
    }
    if (filters?.fromDate) {
      values.push(filters.fromDate);
      conditions.push(`date_of_joining >= $${values.length}`);
    }
    if (filters?.toDate) {
      values.push(filters.toDate);
      conditions.push(`date_of_joining < ($${values.length}::date + interval '1 day')`);
    }
    if (term) {
      values.push(`%${term}%`);
      const p = values.length;
      conditions.push(
        `(first_name ILIKE $${p} OR last_name ILIKE $${p} OR employee_code ILIKE $${p} OR designation ILIKE $${p})`,
      );
    }

    const staff = await this.db.query<StaffRow>(
      tenantId,
      `SELECT * FROM staff WHERE ${conditions.join(" AND ")} ORDER BY first_name ASC`,
      values,
    );

    return staff.map((s) => ({
      id: s.id,
      employee_code: s.employee_code,
      first_name: s.first_name,
      last_name: s.last_name,
      designation: s.designation,
      category_id: s.category_id,
      department: s.department,
      status: s.status,
      has_login: s.user_id !== null,
      date_of_joining: s.date_of_joining,
    }));
  }

  async getStaff(tenantId: string, id: string, branchId: string | null) {
    const conditions = ["id = $1", "tenant_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [id, tenantId];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    const staff = await this.db.queryOne<StaffRow>(
      tenantId,
      `SELECT * FROM staff WHERE ${conditions.join(" AND ")}`,
      values,
    );
    if (!staff) {
      throw new NotFoundException("staff member not found");
    }
    return staff;
  }

  // Employee code: uses whatever the caller supplied, or auto-generates
  // "{branch code}-{sequence}" (padded to 4 digits) when left blank. The
  // whole creation attempt is retried a few times on a unique clash
  // (@@unique([tenantId, employeeCode])) rather than caught mid-transaction
  // -- a Postgres transaction can't recover from a failed statement and
  // keep going, so each attempt is its own fresh withTransaction, same
  // shape as StudentsService.confirmAdmission's admission-number retry loop.
  async createStaff(tenantId: string, actorUserId: string, dto: CreateStaffDto) {
    if (!dto.consent_given) {
      throw new BadRequestException("Consent is required to add a staff member");
    }

    const activeStaffCountRows = await this.db.query<{ count: string }>(
      tenantId,
      "SELECT count(*) FROM staff WHERE tenant_id = $1 AND status != 'relieved' AND deleted_at IS NULL",
      [tenantId],
    );
    await this.planLimits.assertUnderLimit(
      tenantId,
      "max_staff",
      Number(activeStaffCountRows[0]?.count ?? 0),
      "This school's plan allows at most that many staff members.",
    );

    const now = new Date();
    const suppliedCode = dto.employee_code?.trim();
    if (suppliedCode) {
      return this.insertStaff(tenantId, actorUserId, dto, suppliedCode, now);
    }

    const branch = await this.db.queryOne<BranchRow>(
      tenantId,
      "SELECT * FROM branches WHERE id = $1 AND tenant_id = $2",
      [dto.branch_id, tenantId],
    );
    if (!branch) {
      throw new NotFoundException("branch not found");
    }
    const countRows = await this.db.query<{ count: string }>(
      tenantId,
      "SELECT COUNT(*)::text AS count FROM staff WHERE tenant_id = $1 AND branch_id = $2",
      [tenantId, dto.branch_id],
    );
    const baseCount = Number(countRows[0]?.count ?? "0");

    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = `${branch.code}-${String(baseCount + 1 + attempt).padStart(4, "0")}`;
      try {
        return await this.insertStaff(tenantId, actorUserId, dto, candidate, now);
      } catch (error) {
        if (isUniqueViolation(error) && attempt < maxAttempts - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new BadRequestException("could not generate a unique employee code, please retry");
  }

  private async insertStaff(
    tenantId: string,
    actorUserId: string,
    dto: CreateStaffDto,
    employeeCode: string,
    now: Date,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      const staff = await insertRow<StaffRow>(client, "staff", tenantId, {
        branch_id: dto.branch_id,
        employee_code: employeeCode,
        first_name: dto.first_name,
        last_name: dto.last_name ?? null,
        date_of_birth: toDateOrNull(dto.date_of_birth),
        gender: dto.gender ?? null,
        phone: dto.phone ?? null,
        personal_email: dto.personal_email ?? null,
        address: dto.address ?? null,
        city: dto.city ?? null,
        state: dto.state ?? null,
        pincode: dto.pincode ?? null,
        designation: dto.designation,
        category_id: dto.category_id ?? null,
        department: dto.department ?? null,
        employment_type: dto.employment_type,
        date_of_joining: new Date(dto.date_of_joining),
        status: "active",
        qualification: dto.qualification ?? null,
        blood_group: dto.blood_group ?? null,
        pan_number: dto.pan_number ?? null,
        aadhaar_number: dto.aadhaar_number ?? null,
        bank_account_number: dto.bank_account_number ?? null,
        bank_ifsc: dto.bank_ifsc ?? null,
        bank_name: dto.bank_name ?? null,
        pf_number: dto.pf_number ?? null,
        esi_number: dto.esi_number ?? null,
        uan_number: dto.uan_number ?? null,
        emergency_contact_name: dto.emergency_contact_name ?? null,
        emergency_contact_phone: dto.emergency_contact_phone ?? null,
        notes: dto.notes ?? null,
        consent_given: true,
        consent_given_at: now,
        consent_version: CONSENT_VERSION,
        updated_at: now,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "staff",
        entityId: staff.id,
        action: "create",
        summary: `Added staff member '${dto.first_name} ${dto.last_name ?? ""}'`.trim(),
      });

      return staff;
    });
  }

  async updateStaff(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateStaffDto,
    branchId: string | null,
  ) {
    const now = new Date();

    return this.db.withTransaction(tenantId, async (client) => {
      // At most one principal per branch -- clear any other staff's flag
      // in this branch first, mirroring setClassTeacher's exclusivity
      // pattern below.
      if (dto.is_principal) {
        await client.query(
          `UPDATE staff SET is_principal = false, updated_at = $1, updated_by = $2
           WHERE tenant_id = $3 AND branch_id = $4 AND is_principal = true AND id != $5 AND deleted_at IS NULL`,
          [now, actorUserId, tenantId, dto.branch_id, id],
        );
      }

      const updated = await updateRow<StaffRow>(
        client,
        "staff",
        tenantId,
        id,
        {
          employee_code: dto.employee_code,
          first_name: dto.first_name,
          last_name: dto.last_name ?? null,
          date_of_birth: toDateOrNull(dto.date_of_birth),
          gender: dto.gender ?? null,
          phone: dto.phone ?? null,
          personal_email: dto.personal_email ?? null,
          address: dto.address ?? null,
          city: dto.city ?? null,
          state: dto.state ?? null,
          pincode: dto.pincode ?? null,
          designation: dto.designation,
          category_id: dto.category_id ?? null,
          department: dto.department ?? null,
          employment_type: dto.employment_type,
          date_of_joining: new Date(dto.date_of_joining),
          qualification: dto.qualification ?? null,
          blood_group: dto.blood_group ?? null,
          signature_url: dto.signature_url ?? null,
          is_principal: dto.is_principal ?? false,
          pan_number: dto.pan_number ?? null,
          aadhaar_number: dto.aadhaar_number ?? null,
          bank_account_number: dto.bank_account_number ?? null,
          bank_ifsc: dto.bank_ifsc ?? null,
          bank_name: dto.bank_name ?? null,
          pf_number: dto.pf_number ?? null,
          esi_number: dto.esi_number ?? null,
          uan_number: dto.uan_number ?? null,
          emergency_contact_name: dto.emergency_contact_name ?? null,
          emergency_contact_phone: dto.emergency_contact_phone ?? null,
          notes: dto.notes ?? null,
          updated_at: now,
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
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

  // Lightweight, permission-free reads for print pages -- resolving a
  // signature to render doesn't need broad staff.view, and every logged-in
  // user (e.g. a teacher printing their own class's register) should be
  // able to fetch one. Still tenant-scoped -- "permission-free" means any
  // authenticated user of *this* tenant, never a cross-tenant lookup.
  async getStaffSignature(tenantId: string, id: string) {
    const staff = await this.db.queryOne<StaffRow>(
      tenantId,
      "SELECT signature_url FROM staff WHERE id = $1 AND tenant_id = $2",
      [id, tenantId],
    );
    return { signature_url: staff?.signature_url ?? null };
  }

  async getPrincipalSignature(tenantId: string, branchId: string) {
    const principal = await this.db.queryOne<StaffRow>(
      tenantId,
      "SELECT signature_url FROM staff WHERE tenant_id = $1 AND branch_id = $2 AND is_principal = true AND deleted_at IS NULL",
      [tenantId, branchId],
    );
    return { signature_url: principal?.signature_url ?? null };
  }

  // Deactivates (or reactivates) a staff member -- the soft-delete
  // equivalent for HR records; employment history is preserved.
  async setStaffStatus(
    tenantId: string,
    actorUserId: string,
    staffId: string,
    dto: SetStaffStatusDto,
    branchId: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<StaffRow>(
        client,
        "staff",
        tenantId,
        staffId,
        {
          status: dto.status,
          date_of_leaving: toDateOrNull(dto.date_of_leaving),
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
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

  // Issues (or re-issues the mutable fields of) an Experience Letter.
  // Idempotent on the letter number -- called again for the same staff
  // member it updates reason/date/remark but never regenerates the number.
  // Sets status to "relieved", which every active-staff selection query in
  // this codebase (attendance roster, payroll generation, class-teacher
  // picker) already filters on status "active" and so excludes automatically.
  async issueExperienceLetter(
    tenantId: string,
    actorUserId: string,
    staffId: string,
    dto: IssueExperienceLetterDto,
    branchId: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      const staff = await findOneForTenant<StaffRow>(client, "staff", tenantId, staffId, branchId);
      if (!staff) {
        throw new NotFoundException("staff member not found");
      }
      const now = new Date();
      const letterNumber = staff.experience_letter_number ?? generateExperienceLetterNumber(staff.branch_id);

      const updated = await updateRow<StaffRow>(
        client,
        "staff",
        tenantId,
        staffId,
        {
          reason_for_leaving: dto.reason_for_leaving,
          date_of_leaving: new Date(dto.date_of_leaving),
          conduct_remark: dto.conduct_remark ?? null,
          experience_letter_number: letterNumber,
          experience_letter_issue_date: staff.experience_letter_issue_date ?? now,
          status: "relieved",
          updated_at: now,
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        branchId: staff.branch_id,
        actorUserId,
        entityTable: "staff",
        entityId: staffId,
        action: "update",
        summary: `Issued Experience Letter ${letterNumber}`,
      });

      return updated;
    });
  }

  async getExperienceLetter(tenantId: string, staffId: string, branchId: string | null) {
    const conditions = ["id = $1", "tenant_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [staffId, tenantId];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    const staff = await this.db.queryOne<StaffRow>(
      tenantId,
      `SELECT * FROM staff WHERE ${conditions.join(" AND ")}`,
      values,
    );
    if (!staff) {
      throw new NotFoundException("staff member not found");
    }
    return {
      staff_id: staff.id,
      employee_code: staff.employee_code,
      first_name: staff.first_name,
      last_name: staff.last_name,
      designation: staff.designation,
      department: staff.department,
      date_of_joining: staff.date_of_joining,
      date_of_leaving: staff.date_of_leaving,
      reason_for_leaving: staff.reason_for_leaving,
      conduct_remark: staff.conduct_remark,
      experience_letter_number: staff.experience_letter_number,
      experience_letter_issue_date: staff.experience_letter_issue_date,
      status: staff.status,
    };
  }

  async getQrCode(tenantId: string, staffId: string, branchId: string | null) {
    const conditions = ["id = $1", "tenant_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [staffId, tenantId];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    const staff = await this.db.queryOne<StaffRow>(
      tenantId,
      `SELECT * FROM staff WHERE ${conditions.join(" AND ")}`,
      values,
    );
    if (!staff) {
      throw new NotFoundException("staff member not found");
    }
    return { token: this.qrToken.generate("staff", tenantId, staff.id, staff.qr_code_version) };
  }

  // Bumping qr_code_version instantly invalidates every previously-printed
  // code for this staff member -- see Student.qrCodeVersion for the same
  // scheme on the student side.
  async reissueQrCode(tenantId: string, actorUserId: string, staffId: string, branchId: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const staff = await findOneForTenant<StaffRow>(client, "staff", tenantId, staffId, branchId);
      if (!staff) {
        throw new NotFoundException("staff member not found");
      }

      const updated = await updateRow<StaffRow>(
        client,
        "staff",
        tenantId,
        staffId,
        {
          qr_code_version: staff.qr_code_version + 1,
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        branchId: staff.branch_id,
        actorUserId,
        entityTable: "staff",
        entityId: staffId,
        action: "update",
        summary: "Reissued QR code",
      });

      return { token: this.qrToken.generate("staff", tenantId, updated.id, updated.qr_code_version) };
    });
  }

  async getQrCodesBulk(tenantId: string, ids: string[], branchId: string | null) {
    const conditions = ["tenant_id = $1", "id = ANY($2)", "deleted_at IS NULL"];
    const values: unknown[] = [tenantId, ids];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    const staff = await this.db.query<StaffRow>(
      tenantId,
      `SELECT * FROM staff WHERE ${conditions.join(" AND ")}`,
      values,
    );
    return staff.map((s) => ({
      staff_id: s.id,
      token: this.qrToken.generate("staff", tenantId, s.id, s.qr_code_version),
    }));
  }

  async getPhotoUploadUrl(tenantId: string, staffId: string, fileName: string, contentType: string, branchId: string | null) {
    const conditions = ["id = $1", "tenant_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [staffId, tenantId];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    const staff = await this.db.queryOne<StaffRow>(
      tenantId,
      `SELECT * FROM staff WHERE ${conditions.join(" AND ")}`,
      values,
    );
    if (!staff) {
      throw new NotFoundException("staff member not found");
    }
    const ext = sanitizePhotoExtension(fileName);
    const key = `photo-staff-${randomUUID()}${ext ? `.${ext}` : ""}`;
    const upload = await this.storage.createUploadUrl(key, contentType);
    return { ...upload, storage_key: key };
  }

  // Single slot, not a list -- see StudentsService.setPhoto for the same pattern.
  async setPhoto(tenantId: string, actorUserId: string, staffId: string, storageKey: string, branchId: string | null) {
    const previousPath = await this.db.withTransaction(tenantId, async (client) => {
      const staff = await findOneForTenant<StaffRow>(client, "staff", tenantId, staffId, branchId);
      if (!staff) {
        throw new NotFoundException("staff member not found");
      }

      await updateRow<StaffRow>(
        client,
        "staff",
        tenantId,
        staffId,
        {
          photo_path: storageKey,
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        branchId: staff.branch_id,
        actorUserId,
        entityTable: "staff",
        entityId: staffId,
        action: "update",
        summary: "Updated photo",
      });

      return staff.photo_path;
    });

    if (previousPath && previousPath !== storageKey) {
      await this.storage.deleteObject(previousPath);
    }

    return { ok: true };
  }

  async getPhotoUrl(tenantId: string, staffId: string, branchId: string | null) {
    const conditions = ["id = $1", "tenant_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [staffId, tenantId];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    const staff = await this.db.queryOne<StaffRow>(
      tenantId,
      `SELECT * FROM staff WHERE ${conditions.join(" AND ")}`,
      values,
    );
    if (!staff) {
      throw new NotFoundException("staff member not found");
    }
    if (!staff.photo_path) {
      return { url: null };
    }
    return this.storage.createDownloadUrl(staff.photo_path);
  }

  async deletePhoto(tenantId: string, actorUserId: string, staffId: string, branchId: string | null) {
    const previousPath = await this.db.withTransaction(tenantId, async (client) => {
      const staff = await findOneForTenant<StaffRow>(client, "staff", tenantId, staffId, branchId);
      if (!staff) {
        throw new NotFoundException("staff member not found");
      }
      if (!staff.photo_path) {
        return null;
      }

      await updateRow<StaffRow>(
        client,
        "staff",
        tenantId,
        staffId,
        {
          photo_path: null,
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        branchId: staff.branch_id,
        actorUserId,
        entityTable: "staff",
        entityId: staffId,
        action: "update",
        summary: "Removed photo",
      });

      return staff.photo_path;
    });

    if (previousPath) {
      await this.storage.deleteObject(previousPath);
    }

    return { ok: true };
  }

  async getPhotoUrlsBulk(tenantId: string, ids: string[], branchId: string | null) {
    const conditions = ["tenant_id = $1", "id = ANY($2)", "deleted_at IS NULL", "photo_path IS NOT NULL"];
    const values: unknown[] = [tenantId, ids];
    if (branchId) {
      values.push(branchId);
      conditions.push(`branch_id = $${values.length}`);
    }
    const staff = await this.db.query<StaffRow>(
      tenantId,
      `SELECT * FROM staff WHERE ${conditions.join(" AND ")}`,
      values,
    );
    const entries = await Promise.all(
      staff.map(async (s) => ({ staff_id: s.id, ...(await this.storage.createDownloadUrl(s.photo_path!)) })),
    );
    return entries;
  }

  async listTeacherAssignments(tenantId: string, branchId: string, staffId?: string) {
    const conditions = ["ta.tenant_id = $1", "ta.branch_id = $2", "ta.deleted_at IS NULL"];
    const values: unknown[] = [tenantId, branchId];
    if (staffId) {
      values.push(staffId);
      conditions.push(`ta.staff_id = $${values.length}`);
    }

    const rows = await this.db.query<{
      id: string;
      staff_id: string;
      staff_first_name: string;
      staff_last_name: string | null;
      class_id: string;
      class_name: string;
      section_id: string | null;
      section_name: string | null;
      subject_id: string;
      subject_name: string;
      academic_session_id: string;
    }>(
      tenantId,
      `SELECT ta.id, ta.staff_id, st.first_name AS staff_first_name, st.last_name AS staff_last_name,
              ta.class_id, c.name AS class_name, ta.section_id, sec.name AS section_name,
              ta.subject_id, sub.name AS subject_name, ta.academic_session_id
       FROM teacher_subject_assignments ta
       JOIN staff st ON st.id = ta.staff_id
       JOIN classes c ON c.id = ta.class_id
       LEFT JOIN sections sec ON sec.id = ta.section_id
       JOIN subjects sub ON sub.id = ta.subject_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY c.sort_order ASC, st.first_name ASC`,
      values,
    );

    return rows.map((a) => ({
      id: a.id,
      staff_id: a.staff_id,
      staff_name: [a.staff_first_name, a.staff_last_name].filter(Boolean).join(" "),
      class_id: a.class_id,
      class_name: a.class_name,
      section_id: a.section_id,
      section_name: a.section_name,
      subject_id: a.subject_id,
      subject_name: a.subject_name,
      academic_session_id: a.academic_session_id,
    }));
  }

  async createTeacherAssignment(tenantId: string, actorUserId: string, dto: CreateTeacherAssignmentDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const created = await insertRow<TeacherAssignmentRow>(client, "teacher_subject_assignments", tenantId, {
        branch_id: dto.branch_id,
        staff_id: dto.staff_id,
        class_id: dto.class_id,
        section_id: dto.section_id ?? null,
        subject_id: dto.subject_id,
        academic_session_id: dto.academic_session_id,
        updated_at: new Date(),
      });

      await this.audit.record(client, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "teacher_subject_assignments",
        entityId: created.id,
        action: "create",
        summary: "Assigned teacher to subject/class",
      });

      return created;
    });
  }

  async deleteTeacherAssignment(tenantId: string, actorUserId: string, id: string, branchId: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const deleted = await softDeleteRow<TeacherAssignmentRow>(
        client,
        "teacher_subject_assignments",
        tenantId,
        id,
        actorUserId,
        branchId,
      );

      await this.audit.record(client, {
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

  async setClassTeacher(
    tenantId: string,
    actorUserId: string,
    sectionId: string,
    dto: SetClassTeacherDto,
    branchId: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      if (dto.staff_id) {
        // `sections` itself carries no branch_id (it's scoped indirectly via
        // its class), but `staff` does -- reject assigning a class teacher
        // from outside the caller's branch here, since nothing else in this
        // method checks it.
        const staff = await findOneForTenant<StaffRow>(client, "staff", tenantId, dto.staff_id, branchId);
        if (!staff) {
          throw new NotFoundException("staff member not found");
        }

        const conflictResult = await client.query<{ id: string; class_name: string; name: string }>(
          `SELECT s.id, c.name AS class_name, s.name
           FROM sections s
           JOIN classes c ON c.id = s.class_id
           WHERE s.tenant_id = $1 AND s.class_teacher_staff_id = $2 AND s.deleted_at IS NULL AND s.id != $3`,
          [tenantId, dto.staff_id, sectionId],
        );
        const conflict = conflictResult.rows[0];
        if (conflict) {
          throw new BadRequestException(
            `This staff member is already class teacher of another section (${conflict.class_name} - ${conflict.name}).`,
          );
        }
      }

      const updated = await updateRow<TenantRow & { class_teacher_staff_id: string | null }>(
        client,
        "sections",
        tenantId,
        sectionId,
        {
          class_teacher_staff_id: dto.staff_id ?? null,
          updated_at: new Date(),
          updated_by: actorUserId,
        },
      );

      await this.audit.record(client, {
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
