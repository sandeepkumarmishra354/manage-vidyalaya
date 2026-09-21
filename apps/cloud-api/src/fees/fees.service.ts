import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { findOneForTenant, insertRow, softDeleteRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { StudentRow } from "../students/students.service.js";
import type { CarryForwardStructuresDto } from "./dto/carry-forward-structures.dto.js";
import type { CreateFeeStructureDto } from "./dto/create-fee-structure.dto.js";
import type { EditInvoiceDto } from "./dto/edit-invoice.dto.js";
import type { EditPaymentDto } from "./dto/edit-payment.dto.js";
import type { RecordPaymentBatchDto } from "./dto/record-payment-batch.dto.js";
import type { RecordPaymentDto } from "./dto/record-payment.dto.js";
import type { SetStudentFeeAssignmentDto } from "./dto/set-student-fee-assignment.dto.js";
import type { UpdateFeeStructureDto } from "./dto/update-fee-structure.dto.js";

export interface FeeStructureRow extends TenantRow {
  branch_id: string;
  academic_session_id: string | null;
  class_id: string | null;
  name: string;
  amount: number;
  frequency: string;
  fee_type: string;
}

export interface FeeInvoiceRow extends TenantRow {
  branch_id: string;
  student_id: string;
  fee_structure_id: string;
  academic_session_id: string;
  period_label: string;
  gross_amount: number;
  discount_amount: number;
  amount_due: number;
  amount_paid: number;
  due_date: Date | null;
  status: string;
}

interface FeeInvoiceListRow extends FeeInvoiceRow {
  student_first_name: string;
  student_last_name: string | null;
  roll_number: string | null;
  date_of_birth: Date | null;
  class_name: string | null;
  section_name: string | null;
  fee_structure_name: string;
  fee_type: string;
}

export interface FeePaymentRow extends TenantRow {
  invoice_id: string;
  amount: number;
  payment_method: string;
  payment_date: Date;
  receipt_number: string | null;
  recorded_by: string | null;
  remarks: string | null;
}

export interface StudentFeeAssignmentRow extends TenantRow {
  branch_id: string;
  student_id: string;
  fee_structure_id: string;
  mode: string;
  reason: string | null;
}

function invoiceStatus(amountDue: number, amountPaid: number): string {
  if (amountPaid >= amountDue) return "paid";
  if (amountPaid > 0) return "partial";
  return "pending";
}

// Overdue is computed at read time only -- pending/partial with a due date
// already in the past -- never written to the status column, which stays
// the source of truth (see toListItem).
function displayStatus(status: string, dueDate: Date | null): string {
  if ((status === "pending" || status === "partial") && dueDate && dueDate.getTime() < Date.now()) {
    return "overdue";
  }
  return status;
}

function generateReceiptNumber(branchId: string): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `RCPT-${branchId.slice(0, 4).toUpperCase()}-${datePart}-${rand}`;
}

@Injectable()
export class FeesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  listFeeStructures(tenantId: string, branchId: string, feeType?: string, classId?: string) {
    const conditions = ["tenant_id = $1", "branch_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [tenantId, branchId];
    if (feeType) {
      values.push(feeType);
      conditions.push(`fee_type = $${values.length}`);
    }
    if (classId) {
      // A structure with no class (applies to the whole branch) should
      // still surface when filtering by a specific class.
      values.push(classId);
      conditions.push(`(class_id = $${values.length} OR class_id IS NULL)`);
    }
    return this.db.query<FeeStructureRow>(
      tenantId,
      `SELECT * FROM fee_structures WHERE ${conditions.join(" AND ")} ORDER BY name ASC`,
      values,
    );
  }

  // Every fee structure that would normally apply to a student in this
  // class (or branch-wide), scoped to one session (or session-independent)
  // -- shared by admission-time fee assignment and generateInvoices.
  async listMatchingStructures(tenantId: string, branchId: string, classId: string | null, academicSessionId: string) {
    return this.db.query<FeeStructureRow>(
      tenantId,
      `SELECT * FROM fee_structures
       WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL
         AND (class_id = $3 OR class_id IS NULL)
         AND (academic_session_id = $4 OR academic_session_id IS NULL)`,
      [tenantId, branchId, classId, academicSessionId],
    );
  }

  private async resolveCurrentSessionIdTx(client: PoolClient, tenantId: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      "SELECT id FROM academic_sessions WHERE tenant_id = $1 AND is_current = true AND deleted_at IS NULL",
      [tenantId],
    );
    const session = result.rows[0];
    if (!session) {
      throw new BadRequestException("no current academic session set for this tenant");
    }
    return session.id;
  }

  // Resolves the tenant's current academic session -- used when a fee
  // structure is session-independent (academic_session_id: null) and a
  // concrete session still needs to be stamped onto each generated invoice.
  async resolveCurrentSessionId(tenantId: string): Promise<string> {
    return this.db.withTransaction(tenantId, (client) => this.resolveCurrentSessionIdTx(client, tenantId));
  }

  // Fee categories are tenant-extensible (FeeCategoriesModule), not a
  // static enum, so fee_type is checked against the tenant's own category
  // list here rather than via a class-validator constraint.
  private async assertValidFeeType(tenantId: string, feeType: string) {
    const category = await this.db.queryOne(
      tenantId,
      "SELECT id FROM fee_categories WHERE tenant_id = $1 AND key = $2 AND deleted_at IS NULL",
      [tenantId, feeType],
    );
    if (!category) {
      throw new BadRequestException(`unknown fee category '${feeType}'`);
    }
  }

  // A class only exists within one session, so a class-scoped structure
  // always needs a session -- a session-independent structure can only be
  // branch-wide.
  private assertSessionClassCombo(academicSessionId: string | null, classId: string | null) {
    if (academicSessionId === null && classId !== null) {
      throw new BadRequestException("a class-scoped fee structure requires a specific academic session");
    }
  }

  async createFeeStructure(tenantId: string, dto: CreateFeeStructureDto) {
    const feeType = dto.fee_type ?? "tuition";
    await this.assertValidFeeType(tenantId, feeType);
    const academicSessionId = dto.academic_session_id ?? null;
    const classId = dto.class_id ?? null;
    this.assertSessionClassCombo(academicSessionId, classId);

    return this.db.withTransaction(tenantId, async (client) => {
      return insertRow<FeeStructureRow>(client, "fee_structures", tenantId, {
        branch_id: dto.branch_id,
        academic_session_id: academicSessionId,
        class_id: classId,
        name: dto.name,
        amount: dto.amount,
        frequency: dto.frequency,
        fee_type: feeType,
        updated_at: new Date(),
      });
    });
  }

  async updateFeeStructure(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateFeeStructureDto,
    branchId?: string | null,
  ) {
    await this.assertValidFeeType(tenantId, dto.fee_type);
    const academicSessionId = dto.academic_session_id ?? null;
    const classId = dto.class_id ?? null;
    this.assertSessionClassCombo(academicSessionId, classId);

    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<FeeStructureRow>(
        client,
        "fee_structures",
        tenantId,
        id,
        {
          name: dto.name,
          amount: dto.amount,
          frequency: dto.frequency,
          fee_type: dto.fee_type,
          class_id: classId,
          academic_session_id: academicSessionId,
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "fee_structures",
        entityId: id,
        action: "update",
        summary: `Updated fee structure '${dto.name}'`,
      });

      return updated;
    });
  }

  // For monthly/quarterly structures: every period from session start
  // through the cutoff (upToPeriod, "YYYY-MM"; defaults to the current
  // month), capped at session end. one_time/annual structures always
  // produce a single "" period.
  private periodsFor(
    structure: { frequency: string },
    session: { start_date: Date; end_date: Date },
    upToPeriod?: string,
  ): { label: string; dueDate: Date | null }[] {
    if (structure.frequency !== "monthly" && structure.frequency !== "quarterly") {
      return [{ label: "", dueDate: null }];
    }

    const sessionStart = new Date(Date.UTC(session.start_date.getUTCFullYear(), session.start_date.getUTCMonth(), 1));
    const sessionEnd = new Date(Date.UTC(session.end_date.getUTCFullYear(), session.end_date.getUTCMonth(), 1));

    const now = new Date();
    let cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    if (upToPeriod) {
      const [y, m] = upToPeriod.split("-").map(Number);
      if (y && m) cutoff = new Date(Date.UTC(y, m - 1, 1));
    }
    if (cutoff > sessionEnd) cutoff = sessionEnd;

    const periods: { label: string; dueDate: Date }[] = [];

    if (structure.frequency === "monthly") {
      for (let d = sessionStart; d <= cutoff; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
        periods.push({ label: d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }), dueDate: d });
      }
    } else {
      const yearLabel = `${session.start_date.getUTCFullYear()}-${String(session.end_date.getUTCFullYear()).slice(-2)}`;
      let idx = 1;
      for (let d = sessionStart; d <= cutoff; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1))) {
        periods.push({ label: `Q${idx} ${yearLabel}`, dueDate: d });
        idx += 1;
      }
    }

    return periods;
  }

  // Fetches the student's active discount assignments and stacks them
  // additively (oldest-assigned first) against grossAmount, capped so
  // amountDue never goes below 0. Shared by invoice generation and
  // reapplyDiscountsForStudent.
  private async computeDiscount(
    client: PoolClient,
    tenantId: string,
    studentId: string,
    feeCategoryId: string | null,
    grossAmount: number,
    asOf: Date,
  ): Promise<{ discountAmount: number; applied: { feeDiscountId: string; amount: number }[] }> {
    const result = await client.query<{
      fee_discount_id: string;
      is_active: boolean;
      deleted_at: Date | null;
      fee_category_id: string | null;
      valid_from: Date | null;
      valid_to: Date | null;
      discount_type: string;
      value: number;
    }>(
      `SELECT fd.id AS fee_discount_id, fd.is_active, fd.deleted_at, fd.fee_category_id, fd.valid_from, fd.valid_to,
              fd.discount_type, fd.value
       FROM student_fee_discounts sfd
       JOIN fee_discounts fd ON fd.id = sfd.fee_discount_id
       WHERE sfd.tenant_id = $1 AND sfd.student_id = $2 AND sfd.deleted_at IS NULL
       ORDER BY sfd.updated_at ASC`,
      [tenantId, studentId],
    );

    let remaining = grossAmount;
    const applied: { feeDiscountId: string; amount: number }[] = [];

    for (const d of result.rows) {
      if (!d.is_active || d.deleted_at) continue;
      if (d.fee_category_id && d.fee_category_id !== feeCategoryId) continue;
      if (d.valid_from && asOf < d.valid_from) continue;
      if (d.valid_to && asOf > d.valid_to) continue;
      if (remaining <= 0) continue;

      const amount = d.discount_type === "percentage" ? Math.round((grossAmount * d.value) / 100) : d.value;
      const capped = Math.min(amount, remaining);
      if (capped <= 0) continue;

      applied.push({ feeDiscountId: d.fee_discount_id, amount: capped });
      remaining -= capped;
    }

    return { discountAmount: grossAmount - remaining, applied };
  }

  // Generates every still-missing period-invoice for one student against
  // one structure (a single "" invoice for one_time/annual; one per period
  // through upToPeriod for monthly/quarterly), applying that student's
  // active discounts as each row is created. The caller always owns the
  // transaction (opens it via db.withTransaction and passes the client
  // in) -- reusable both from generateInvoices' per-student loop and
  // directly for a single student (an "include" override or admission
  // confirmation taking immediate effect).
  async generateInvoiceForStudent(
    tenantId: string,
    studentId: string,
    feeStructureId: string,
    client: PoolClient,
    upToPeriod?: string,
    branchId?: string | null,
  ): Promise<number> {
    const structure = await findOneForTenant<FeeStructureRow>(client, "fee_structures", tenantId, feeStructureId, branchId);
    if (!structure) {
      throw new NotFoundException("fee structure not found");
    }
    const sessionId = structure.academic_session_id ?? (await this.resolveCurrentSessionIdTx(client, tenantId));
    const sessionResult = await client.query<{ id: string; start_date: Date; end_date: Date }>(
      "SELECT id, start_date, end_date FROM academic_sessions WHERE id = $1 AND tenant_id = $2",
      [sessionId, tenantId],
    );
    const session = sessionResult.rows[0];
    if (!session) {
      throw new NotFoundException("academic session not found");
    }
    const feeCategoryResult = await client.query<{ id: string }>(
      "SELECT id FROM fee_categories WHERE tenant_id = $1 AND key = $2",
      [tenantId, structure.fee_type],
    );
    const feeCategoryId = feeCategoryResult.rows[0]?.id ?? null;

    const periods = this.periodsFor(structure, session, upToPeriod);

    const existingResult = await client.query<{ period_label: string }>(
      "SELECT period_label FROM fee_invoices WHERE fee_structure_id = $1 AND student_id = $2",
      [feeStructureId, studentId],
    );
    const existingLabels = new Set(existingResult.rows.map((r) => r.period_label));

    const toCreate = periods.filter((p) => !existingLabels.has(p.label));
    if (toCreate.length === 0) return 0;

    const now = new Date();
    for (const p of toCreate) {
      const { discountAmount, applied } = await this.computeDiscount(
        client,
        tenantId,
        studentId,
        feeCategoryId,
        structure.amount,
        p.dueDate ?? now,
      );
      const amountDue = Math.max(structure.amount - discountAmount, 0);

      const invoice = await insertRow<FeeInvoiceRow>(client, "fee_invoices", tenantId, {
        branch_id: structure.branch_id,
        student_id: studentId,
        fee_structure_id: feeStructureId,
        academic_session_id: sessionId,
        period_label: p.label,
        gross_amount: structure.amount,
        discount_amount: discountAmount,
        amount_due: amountDue,
        amount_paid: 0,
        due_date: p.dueDate,
        status: "pending",
        updated_at: now,
      });

      for (const a of applied) {
        await insertRow(client, "fee_invoice_discounts", tenantId, {
          fee_invoice_id: invoice.id,
          fee_discount_id: a.feeDiscountId,
          amount: a.amount,
          created_at: now,
          updated_at: now,
        });
      }
    }

    return toCreate.length;
  }

  // Creates invoices for every eligible student covered by the structure:
  // (its class, or every class in the branch, if class_id is null) union
  // any per-student "include" override, minus any "exclude" override.
  // Accepts an optional pooled client so the bulk path (generateInvoicesBulk)
  // can share this exact implementation across several structures inside
  // one transaction. Returns the created count.
  async generateInvoices(
    tenantId: string,
    feeStructureId: string,
    client?: PoolClient,
    upToPeriod?: string,
    branchId?: string | null,
  ): Promise<number> {
    const run = async (c: PoolClient) => {
      const structure = await findOneForTenant<FeeStructureRow>(c, "fee_structures", tenantId, feeStructureId, branchId);
      if (!structure) {
        throw new NotFoundException("fee structure not found");
      }

      const conditions = ["tenant_id = $1", "branch_id = $2", "deleted_at IS NULL", "status = 'enrolled'"];
      const values: unknown[] = [tenantId, structure.branch_id];
      if (structure.class_id) {
        values.push(structure.class_id);
        conditions.push(`current_class_id = $${values.length}`);
      }
      const classWideResult = await c.query<{ id: string }>(
        `SELECT id FROM students WHERE ${conditions.join(" AND ")}`,
        values,
      );

      const assignmentsResult = await c.query<{ student_id: string; mode: string }>(
        "SELECT student_id, mode FROM student_fee_assignments WHERE tenant_id = $1 AND fee_structure_id = $2 AND deleted_at IS NULL",
        [tenantId, feeStructureId],
      );

      const eligibleIds = new Set(classWideResult.rows.map((s) => s.id));
      for (const a of assignmentsResult.rows) {
        if (a.mode === "include") eligibleIds.add(a.student_id);
      }
      for (const a of assignmentsResult.rows) {
        if (a.mode === "exclude") eligibleIds.delete(a.student_id);
      }

      let created = 0;
      for (const studentId of eligibleIds) {
        created += await this.generateInvoiceForStudent(tenantId, studentId, feeStructureId, c, upToPeriod, branchId);
      }
      return created;
    };

    return client ? run(client) : this.db.withTransaction(tenantId, run);
  }

  // Generates invoices for every active fee structure in a branch+session
  // in one click -- omitting fee_structure_ids means "every one of them",
  // otherwise just the given subset. Loops generateInvoices inside a single
  // transaction so the whole batch either lands together or not at all.
  async generateInvoicesBulk(
    tenantId: string,
    actorUserId: string,
    branchId: string,
    academicSessionId: string,
    feeStructureIds?: string[],
    upToPeriod?: string,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      const conditions = ["tenant_id = $1", "branch_id = $2", "academic_session_id = $3", "deleted_at IS NULL"];
      const values: unknown[] = [tenantId, branchId, academicSessionId];
      if (feeStructureIds && feeStructureIds.length > 0) {
        values.push(feeStructureIds);
        conditions.push(`id = ANY($${values.length})`);
      }
      const structuresResult = await client.query<FeeStructureRow>(
        `SELECT * FROM fee_structures WHERE ${conditions.join(" AND ")}`,
        values,
      );

      const byStructure: { fee_structure_id: string; created: number }[] = [];
      for (const structure of structuresResult.rows) {
        const created = await this.generateInvoices(tenantId, structure.id, client, upToPeriod, branchId);
        byStructure.push({ fee_structure_id: structure.id, created });
      }

      const total = byStructure.reduce((sum, r) => sum + r.created, 0);

      if (total > 0) {
        await this.audit.record(client, {
          tenantId,
          branchId,
          actorUserId,
          entityTable: "fee_invoices",
          entityId: branchId,
          action: "create",
          summary: `Bulk-generated ${total} invoice(s) across ${structuresResult.rows.length} fee structure(s)`,
        });
      }

      return { created: total, by_structure: byStructure };
    });
  }

  // Upserts a per-student include/exclude override against a fee
  // structure. Excluding auto-voids any non-voided, unpaid invoice already
  // generated for that (student, structure) -- a paid one must be reversed
  // first. Including takes immediate effect: the student's invoice(s) are
  // generated right away rather than waiting for the next bulk run.
  async setStudentFeeAssignment(
    tenantId: string,
    actorUserId: string,
    dto: SetStudentFeeAssignmentDto,
    branchId?: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      const structure = await findOneForTenant<FeeStructureRow>(
        client,
        "fee_structures",
        tenantId,
        dto.fee_structure_id,
        branchId,
      );
      if (!structure) {
        throw new NotFoundException("fee structure not found");
      }

      const existingConditions = ["tenant_id = $1", "student_id = $2", "fee_structure_id = $3"];
      const existingParams: unknown[] = [tenantId, dto.student_id, dto.fee_structure_id];
      if (branchId) {
        existingParams.push(branchId);
        existingConditions.push(`branch_id = $${existingParams.length}`);
      }
      const existingResult = await client.query<StudentFeeAssignmentRow>(
        `SELECT * FROM student_fee_assignments WHERE ${existingConditions.join(" AND ")}`,
        existingParams,
      );
      const existing = existingResult.rows[0];
      const now = new Date();

      const assignment = existing
        ? await updateRow<StudentFeeAssignmentRow>(
            client,
            "student_fee_assignments",
            tenantId,
            existing.id,
            {
              mode: dto.mode,
              reason: dto.reason ?? null,
              deleted_at: null,
              updated_at: now,
              updated_by: actorUserId,
            },
            branchId,
          )
        : await insertRow<StudentFeeAssignmentRow>(client, "student_fee_assignments", tenantId, {
            branch_id: structure.branch_id,
            student_id: dto.student_id,
            fee_structure_id: dto.fee_structure_id,
            mode: dto.mode,
            reason: dto.reason ?? null,
            updated_at: now,
            updated_by: actorUserId,
          });

      if (dto.mode === "exclude") {
        const invoiceConditions = ["tenant_id = $1", "student_id = $2", "fee_structure_id = $3", "deleted_at IS NULL", "status != 'voided'"];
        const invoiceParams: unknown[] = [tenantId, dto.student_id, dto.fee_structure_id];
        if (branchId) {
          invoiceParams.push(branchId);
          invoiceConditions.push(`branch_id = $${invoiceParams.length}`);
        }
        const invoicesResult = await client.query<FeeInvoiceRow>(
          `SELECT * FROM fee_invoices WHERE ${invoiceConditions.join(" AND ")}`,
          invoiceParams,
        );
        if (invoicesResult.rows.some((i) => i.amount_paid > 0)) {
          throw new BadRequestException(
            "this student has a payment recorded against this fee -- reverse it before excluding them",
          );
        }
        for (const invoice of invoicesResult.rows) {
          await updateRow<FeeInvoiceRow>(
            client,
            "fee_invoices",
            tenantId,
            invoice.id,
            {
              status: "voided",
              updated_at: now,
              updated_by: actorUserId,
            },
            branchId,
          );
        }
      }

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "student_fee_assignments",
        entityId: assignment.id,
        action: existing ? "update" : "create",
        summary:
          dto.mode === "include"
            ? `Assigned fee structure '${structure.name}' to a student`
            : `Excluded a student from fee structure '${structure.name}'`,
      });

      if (dto.mode === "include") {
        await this.generateInvoiceForStudent(tenantId, dto.student_id, dto.fee_structure_id, client, undefined, branchId);
      }

      return assignment;
    });
  }

  async removeStudentFeeAssignment(tenantId: string, actorUserId: string, id: string, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<StudentFeeAssignmentRow>(
        client,
        "student_fee_assignments",
        tenantId,
        id,
        branchId,
      );
      if (!existing) {
        throw new NotFoundException("assignment not found");
      }

      const updated = await softDeleteRow<StudentFeeAssignmentRow>(
        client,
        "student_fee_assignments",
        tenantId,
        id,
        actorUserId,
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "student_fee_assignments",
        entityId: id,
        action: "delete",
        summary: "Removed fee structure override",
      });

      return updated;
    });
  }

  async listStructureAssignments(tenantId: string, feeStructureId: string, branchId?: string | null) {
    const conditions = ["sfa.tenant_id = $1", "sfa.fee_structure_id = $2", "sfa.deleted_at IS NULL"];
    const values: unknown[] = [tenantId, feeStructureId];
    if (branchId) {
      values.push(branchId);
      conditions.push(`sfa.branch_id = $${values.length}`);
    }
    const rows = await this.db.query<{
      id: string;
      student_id: string;
      first_name: string;
      last_name: string | null;
      class_name: string | null;
      mode: string;
      reason: string | null;
    }>(
      tenantId,
      `SELECT sfa.id, sfa.student_id, s.first_name, s.last_name, c.name AS class_name, sfa.mode, sfa.reason
       FROM student_fee_assignments sfa
       JOIN students s ON s.id = sfa.student_id
       LEFT JOIN classes c ON c.id = s.current_class_id
       WHERE ${conditions.join(" AND ")}`,
      values,
    );
    return rows.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      student_name: [r.first_name, r.last_name].filter(Boolean).join(" "),
      class_name: r.class_name,
      mode: r.mode,
      reason: r.reason,
    }));
  }

  async listStudentFeeAssignments(tenantId: string, studentId: string, branchId?: string | null) {
    const conditions = ["sfa.tenant_id = $1", "sfa.student_id = $2", "sfa.deleted_at IS NULL"];
    const values: unknown[] = [tenantId, studentId];
    if (branchId) {
      values.push(branchId);
      conditions.push(`sfa.branch_id = $${values.length}`);
    }
    const rows = await this.db.query<{
      id: string;
      fee_structure_id: string;
      fee_structure_name: string;
      mode: string;
      reason: string | null;
    }>(
      tenantId,
      `SELECT sfa.id, sfa.fee_structure_id, fs.name AS fee_structure_name, sfa.mode, sfa.reason
       FROM student_fee_assignments sfa
       JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
       WHERE ${conditions.join(" AND ")}`,
      values,
    );
    return rows.map((r) => ({
      id: r.id,
      fee_structure_id: r.fee_structure_id,
      fee_structure_name: r.fee_structure_name,
      mode: r.mode,
      reason: r.reason,
    }));
  }

  async voidInvoice(tenantId: string, actorUserId: string, invoiceId: string, reason: string, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<FeeInvoiceRow>(
        client,
        "fee_invoices",
        tenantId,
        invoiceId,
        {
          status: "voided",
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "fee_invoices",
        entityId: invoiceId,
        action: "update",
        summary: `Voided invoice: ${reason}`,
      });

      return updated;
    });
  }

  async editInvoice(
    tenantId: string,
    actorUserId: string,
    invoiceId: string,
    dto: EditInvoiceDto,
    branchId?: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      const invoice = await findOneForTenant<FeeInvoiceRow>(client, "fee_invoices", tenantId, invoiceId, branchId);
      if (!invoice) {
        throw new NotFoundException("invoice not found");
      }
      if (invoice.status === "voided") {
        throw new BadRequestException("cannot edit a voided invoice");
      }
      if (dto.amount_due < invoice.amount_paid) {
        throw new BadRequestException("amount due cannot be less than the amount already paid");
      }

      const updated = await updateRow<FeeInvoiceRow>(
        client,
        "fee_invoices",
        tenantId,
        invoiceId,
        {
          amount_due: dto.amount_due,
          due_date: dto.due_date !== undefined ? (dto.due_date ? new Date(dto.due_date) : null) : invoice.due_date,
          status: invoiceStatus(dto.amount_due, invoice.amount_paid),
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "fee_invoices",
        entityId: invoiceId,
        action: "update",
        summary: `Edited invoice: ${dto.reason}`,
      });

      return updated;
    });
  }

  // Batch-resolves each student's guardian to show on a printed document:
  // the one flagged primary, falling back to the first active (non-deleted)
  // linked guardian -- via DISTINCT ON rather than N+1 lookups.
  private async fetchPrimaryGuardianNames(tenantId: string, studentIds: string[]): Promise<Map<string, string>> {
    if (studentIds.length === 0) return new Map();
    const uniqueIds = [...new Set(studentIds)];
    const rows = await this.db.query<{ student_id: string; full_name: string }>(
      tenantId,
      `SELECT DISTINCT ON (sg.student_id) sg.student_id, g.full_name
       FROM student_guardians sg
       JOIN guardians g ON g.id = sg.guardian_id
       WHERE sg.tenant_id = $1 AND sg.student_id = ANY($2) AND g.deleted_at IS NULL
       ORDER BY sg.student_id, sg.is_primary_contact DESC`,
      [tenantId, uniqueIds],
    );
    return new Map(rows.map((r) => [r.student_id, r.full_name]));
  }

  private static readonly INVOICE_LIST_SELECT = `
    fi.*, s.first_name AS student_first_name, s.last_name AS student_last_name, s.roll_number, s.date_of_birth,
    c.name AS class_name, sec.name AS section_name, fs.name AS fee_structure_name, fs.fee_type
    FROM fee_invoices fi
    JOIN students s ON s.id = fi.student_id
    JOIN fee_structures fs ON fs.id = fi.fee_structure_id
    LEFT JOIN classes c ON c.id = s.current_class_id
    LEFT JOIN sections sec ON sec.id = s.current_section_id`;

  async listInvoices(tenantId: string, branchId: string, status?: string, feeType?: string, classId?: string) {
    const conditions = ["fi.tenant_id = $1", "fi.branch_id = $2", "fi.deleted_at IS NULL"];
    const values: unknown[] = [tenantId, branchId];
    if (status === "overdue") {
      conditions.push(`fi.status IN ('pending', 'partial') AND fi.due_date < now()`);
    } else if (status) {
      values.push(status);
      conditions.push(`fi.status = $${values.length}`);
    }
    if (feeType) {
      values.push(feeType);
      conditions.push(`fs.fee_type = $${values.length}`);
    }
    if (classId) {
      values.push(classId);
      conditions.push(`s.current_class_id = $${values.length}`);
    }

    const rows = await this.db.query<FeeInvoiceListRow>(
      tenantId,
      `SELECT ${FeesService.INVOICE_LIST_SELECT}
       WHERE ${conditions.join(" AND ")}
       ORDER BY fi.due_date ASC, s.first_name ASC`,
      values,
    );

    const guardianByStudent = await this.fetchPrimaryGuardianNames(
      tenantId,
      rows.map((r) => r.student_id),
    );
    return rows.map((i) => this.toListItem(i, guardianByStudent.get(i.student_id) ?? null));
  }

  async getStudentFeeSummary(tenantId: string, studentId: string, branchId?: string | null) {
    const invoiceConditions = ["fi.tenant_id = $1", "fi.student_id = $2", "fi.deleted_at IS NULL"];
    const invoiceValues: unknown[] = [tenantId, studentId];
    if (branchId) {
      invoiceValues.push(branchId);
      invoiceConditions.push(`fi.branch_id = $${invoiceValues.length}`);
    }
    const rows = await this.db.query<FeeInvoiceListRow>(
      tenantId,
      `SELECT ${FeesService.INVOICE_LIST_SELECT}
       WHERE ${invoiceConditions.join(" AND ")}
       ORDER BY fi.due_date ASC`,
      invoiceValues,
    );

    const paymentConditions = ["fi.tenant_id = $1", "fi.student_id = $2", "fp.deleted_at IS NULL"];
    const paymentValues: unknown[] = [tenantId, studentId];
    if (branchId) {
      paymentValues.push(branchId);
      paymentConditions.push(`fi.branch_id = $${paymentValues.length}`);
    }
    const payments = await this.db.query<FeePaymentRow>(
      tenantId,
      `SELECT fp.*
       FROM fee_payments fp
       JOIN fee_invoices fi ON fi.id = fp.invoice_id
       WHERE ${paymentConditions.join(" AND ")}
       ORDER BY fp.payment_date DESC`,
      paymentValues,
    );

    const guardianByStudent = await this.fetchPrimaryGuardianNames(tenantId, [studentId]);
    const guardianName = guardianByStudent.get(studentId) ?? null;

    const totalDue = rows.reduce((sum, i) => sum + i.amount_due, 0);
    const totalPaid = rows.reduce((sum, i) => sum + i.amount_paid, 0);

    return {
      invoices: rows.map((i) => this.toListItem(i, guardianName)),
      payments: payments.map((p) => ({
        id: p.id,
        invoice_id: p.invoice_id,
        amount: p.amount,
        payment_method: p.payment_method,
        payment_date: p.payment_date,
        receipt_number: p.receipt_number,
      })),
      total_due: totalDue,
      total_paid: totalPaid,
    };
  }

  // Creates one fee_payments row and updates its invoice's amount_paid/
  // status accordingly -- the core logic shared by the single-payment,
  // batch/combined-payment, and edit-payment (reverse-then-reapply) paths.
  // Auto-generates a receipt number when the caller doesn't supply one, so
  // every payment is reprint-able.
  private async applyPayment(
    client: PoolClient,
    tenantId: string,
    actorUserId: string,
    now: Date,
    entry: {
      invoiceId: string;
      amount: number;
      paymentMethod: string;
      paymentDate: string;
      receiptNumber: string | null;
      remarks: string | null;
    },
    branchId?: string | null,
  ) {
    const invoice = await findOneForTenant<FeeInvoiceRow>(client, "fee_invoices", tenantId, entry.invoiceId, branchId);
    if (!invoice) {
      throw new NotFoundException("invoice not found");
    }
    const receiptNumber = entry.receiptNumber ?? generateReceiptNumber(invoice.branch_id);

    const payment = await insertRow<FeePaymentRow>(client, "fee_payments", tenantId, {
      invoice_id: entry.invoiceId,
      amount: entry.amount,
      payment_method: entry.paymentMethod,
      payment_date: new Date(entry.paymentDate),
      receipt_number: receiptNumber,
      remarks: entry.remarks,
      recorded_by: actorUserId,
      updated_at: now,
    });

    const newPaid = invoice.amount_paid + entry.amount;
    await updateRow<FeeInvoiceRow>(
      client,
      "fee_invoices",
      tenantId,
      entry.invoiceId,
      {
        amount_paid: newPaid,
        status: invoiceStatus(invoice.amount_due, newPaid),
        updated_at: now,
      },
      branchId,
    );

    return payment;
  }

  // Records a payment and updates the invoice's amount_paid/status
  // accordingly, in one transaction.
  async recordPayment(tenantId: string, actorUserId: string, dto: RecordPaymentDto, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const payment = await this.applyPayment(
        client,
        tenantId,
        actorUserId,
        new Date(),
        {
          invoiceId: dto.invoice_id,
          amount: dto.amount,
          paymentMethod: dto.payment_method,
          paymentDate: dto.payment_date,
          receiptNumber: dto.receipt_number ?? null,
          remarks: dto.remarks ?? null,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "fee_payments",
        entityId: payment.id,
        action: "create",
        summary: `Recorded payment of ${dto.amount} paise`,
      });

      return payment;
    });
  }

  // Records one payment per invoice, sharing one receipt number/timestamp,
  // in a single transaction -- the "pay several outstanding invoices for
  // one student in one combined receipt" flow. Amounts are explicit per
  // invoice, no auto-allocation across them.
  async recordPaymentBatch(tenantId: string, actorUserId: string, dto: RecordPaymentBatchDto, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      const payments = [];
      let sharedReceiptNumber = dto.receipt_number ?? null;
      if (!sharedReceiptNumber) {
        const firstInvoice = await findOneForTenant<FeeInvoiceRow>(
          client,
          "fee_invoices",
          tenantId,
          dto.entries[0].invoice_id,
          branchId,
        );
        if (!firstInvoice) {
          throw new NotFoundException("invoice not found");
        }
        sharedReceiptNumber = generateReceiptNumber(firstInvoice.branch_id);
      }
      for (const entry of dto.entries) {
        const payment = await this.applyPayment(
          client,
          tenantId,
          actorUserId,
          now,
          {
            invoiceId: entry.invoice_id,
            amount: entry.amount,
            paymentMethod: dto.payment_method,
            paymentDate: dto.payment_date,
            receiptNumber: sharedReceiptNumber,
            remarks: dto.remarks ?? null,
          },
          branchId,
        );
        payments.push(payment);
      }

      const total = dto.entries.reduce((sum, e) => sum + e.amount, 0);

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "fee_payments",
        entityId: payments[0].id,
        action: "create",
        summary: `Recorded combined payment of ${total} paise across ${dto.entries.length} invoice(s)`,
      });

      return payments;
    });
  }

  // Reverses a payment by inserting a negative-amount fee_payments row
  // (rather than deleting the original) and recomputing the invoice's
  // amount_paid/status -- keeps the payment history/audit trail intact.
  private async reversePaymentTx(
    client: PoolClient,
    tenantId: string,
    actorUserId: string,
    now: Date,
    original: { id: string; invoiceId: string; amount: number; paymentMethod: string },
    reason: string,
    branchId?: string | null,
  ) {
    await insertRow(client, "fee_payments", tenantId, {
      invoice_id: original.invoiceId,
      amount: -original.amount,
      payment_method: original.paymentMethod,
      payment_date: now,
      remarks: `Reversal: ${reason}`,
      recorded_by: actorUserId,
      updated_at: now,
    });

    const invoice = await findOneForTenant<FeeInvoiceRow>(client, "fee_invoices", tenantId, original.invoiceId, branchId);
    if (!invoice) {
      throw new NotFoundException("invoice not found");
    }
    const newPaid = invoice.amount_paid - original.amount;

    await updateRow<FeeInvoiceRow>(
      client,
      "fee_invoices",
      tenantId,
      original.invoiceId,
      {
        amount_paid: newPaid,
        status: invoiceStatus(invoice.amount_due, newPaid),
        updated_at: now,
      },
      branchId,
    );

    await this.audit.record(client, {
      tenantId,
      actorUserId,
      entityTable: "fee_payments",
      entityId: original.id,
      action: "update",
      summary: `Reversed payment: ${reason}`,
    });
  }

  async reversePayment(tenantId: string, actorUserId: string, paymentId: string, reason: string, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      // fee_payments has no branch_id column of its own -- it inherits branch
      // isolation via its invoice, enforced by reversePaymentTx's branchId-
      // scoped findOneForTenant on fee_invoices below.
      const original = await findOneForTenant<FeePaymentRow>(client, "fee_payments", tenantId, paymentId);
      if (!original) {
        throw new NotFoundException("payment not found");
      }

      return this.reversePaymentTx(
        client,
        tenantId,
        actorUserId,
        new Date(),
        { id: original.id, invoiceId: original.invoice_id, amount: original.amount, paymentMethod: original.payment_method },
        reason,
        branchId,
      );
    });
  }

  // Implemented as reverse-then-reapply in one transaction -- the
  // corrected row keeps the original receipt_number, so a reprint after an
  // edit still shows one consistent receipt.
  async editPayment(tenantId: string, actorUserId: string, paymentId: string, dto: EditPaymentDto, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const original = await findOneForTenant<FeePaymentRow>(client, "fee_payments", tenantId, paymentId);
      if (!original) {
        throw new NotFoundException("payment not found");
      }
      if (original.amount < 0) {
        throw new BadRequestException("cannot edit a reversal entry");
      }

      const now = new Date();
      await this.reversePaymentTx(
        client,
        tenantId,
        actorUserId,
        now,
        { id: original.id, invoiceId: original.invoice_id, amount: original.amount, paymentMethod: original.payment_method },
        `Correcting payment (${dto.reason})`,
        branchId,
      );

      const corrected = await this.applyPayment(
        client,
        tenantId,
        actorUserId,
        now,
        {
          invoiceId: original.invoice_id,
          amount: dto.amount,
          paymentMethod: dto.payment_method,
          paymentDate: dto.payment_date,
          receiptNumber: original.receipt_number,
          remarks: dto.remarks ?? original.remarks,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "fee_payments",
        entityId: corrected.id,
        action: "update",
        summary: `Corrected payment: ${dto.reason}`,
      });

      return corrected;
    });
  }

  // Every payment sharing a receipt number, joined with its invoice --
  // backs both the original print and a later reprint. Reversal rows never
  // carry a receipt_number, so they're naturally excluded.
  async getPaymentReceipt(tenantId: string, receiptNumber: string, branchId?: string | null) {
    const payments = await this.db.query<FeePaymentRow>(
      tenantId,
      "SELECT * FROM fee_payments WHERE tenant_id = $1 AND receipt_number = $2 AND deleted_at IS NULL ORDER BY payment_date ASC",
      [tenantId, receiptNumber],
    );
    if (payments.length === 0) {
      throw new NotFoundException("receipt not found");
    }

    // fee_payments carries no branch_id of its own -- branch isolation is
    // enforced here on the invoices it references instead: a branch-scoped
    // caller only gets back invoice rows inside their own branch, and if
    // that leaves any payment's invoice unresolved (this receipt actually
    // belongs to another branch), the whole receipt 404s rather than
    // partially rendering or crashing on the missing lookup below.
    const invoiceIds = [...new Set(payments.map((p) => p.invoice_id))];
    const invoiceConditions = ["fi.tenant_id = $1", "fi.id = ANY($2)"];
    const invoiceValues: unknown[] = [tenantId, invoiceIds];
    if (branchId) {
      invoiceValues.push(branchId);
      invoiceConditions.push(`fi.branch_id = $${invoiceValues.length}`);
    }
    const invoiceRows = await this.db.query<FeeInvoiceListRow>(
      tenantId,
      `SELECT ${FeesService.INVOICE_LIST_SELECT}
       WHERE ${invoiceConditions.join(" AND ")}`,
      invoiceValues,
    );
    if (invoiceRows.length < invoiceIds.length) {
      throw new NotFoundException("receipt not found");
    }
    const invoiceById = new Map(invoiceRows.map((i) => [i.id, i]));
    const guardianByStudent = await this.fetchPrimaryGuardianNames(
      tenantId,
      invoiceRows.map((i) => i.student_id),
    );

    return payments.map((p) => {
      const invoice = invoiceById.get(p.invoice_id)!;
      return {
        payment: {
          id: p.id,
          amount: p.amount,
          payment_method: p.payment_method,
          payment_date: p.payment_date,
          receipt_number: p.receipt_number,
          remarks: p.remarks,
        },
        // The frontend receipt renderer (PaymentReceipt) computes each
        // row's "Balance" as `amount_due - (invoice.amount_paid +
        // payment.amount)` -- correct when `invoice` is the PRE-payment
        // snapshot, which is what the two live record-payment flows pass
        // it (they hold onto the invoice they already had in hand before
        // submitting). This reprint path instead fetches the invoice's
        // CURRENT row, whose amount_paid already includes this payment,
        // so adding payment.amount again double-counted it -- a fully
        // paid invoice reprinted showed a negative balance instead of
        // zero. Subtracting this payment back out here restores the same
        // pre-payment contract for the reprint path.
        invoice: this.toListItem(
          { ...invoice, amount_paid: invoice.amount_paid - p.amount },
          guardianByStudent.get(invoice.student_id) ?? null,
        ),
      };
    });
  }

  async listPayments(
    tenantId: string,
    branchId: string,
    filters: { from?: string; to?: string; studentId?: string; receiptNumber?: string },
  ) {
    const conditions = ["fp.tenant_id = $1", "fp.deleted_at IS NULL", "fi.branch_id = $2"];
    const values: unknown[] = [tenantId, branchId];
    if (filters.studentId) {
      values.push(filters.studentId);
      conditions.push(`fi.student_id = $${values.length}`);
    }
    if (filters.receiptNumber) {
      values.push(filters.receiptNumber);
      conditions.push(`fp.receipt_number = $${values.length}`);
    }
    if (filters.from) {
      values.push(new Date(filters.from));
      conditions.push(`fp.payment_date >= $${values.length}`);
    }
    if (filters.to) {
      values.push(new Date(filters.to));
      conditions.push(`fp.payment_date <= $${values.length}`);
    }

    const rows = await this.db.query<
      FeePaymentRow & { student_id: string; student_first_name: string; student_last_name: string | null; fee_structure_name: string }
    >(
      tenantId,
      `SELECT fp.*, fi.student_id, s.first_name AS student_first_name, s.last_name AS student_last_name, fs.name AS fee_structure_name
       FROM fee_payments fp
       JOIN fee_invoices fi ON fi.id = fp.invoice_id
       JOIN students s ON s.id = fi.student_id
       JOIN fee_structures fs ON fs.id = fi.fee_structure_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY fp.payment_date DESC`,
      values,
    );

    return rows.map((p) => ({
      id: p.id,
      invoice_id: p.invoice_id,
      student_id: p.student_id,
      student_name: [p.student_first_name, p.student_last_name].filter(Boolean).join(" "),
      fee_structure_name: p.fee_structure_name,
      amount: p.amount,
      payment_method: p.payment_method,
      payment_date: p.payment_date,
      receipt_number: p.receipt_number,
      remarks: p.remarks,
    }));
  }

  // Clones every non-deleted, session-scoped fee structure from one
  // session to another, remapping class_id via the same mapping student
  // promotion already builds. Session-independent structures need nothing
  // carried forward -- they already apply to the new session automatically.
  async carryForwardStructures(tenantId: string, actorUserId: string, dto: CarryForwardStructuresDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const structuresResult = await client.query<FeeStructureRow>(
        "SELECT * FROM fee_structures WHERE tenant_id = $1 AND academic_session_id = $2 AND deleted_at IS NULL",
        [tenantId, dto.from_session_id],
      );

      let created = 0;
      const now = new Date();
      for (const s of structuresResult.rows) {
        const newClassId = s.class_id ? (dto.class_mapping[s.class_id] ?? null) : null;
        if (s.class_id && !newClassId) continue;

        await insertRow<FeeStructureRow>(client, "fee_structures", tenantId, {
          branch_id: s.branch_id,
          academic_session_id: dto.to_session_id,
          class_id: newClassId,
          name: s.name,
          amount: s.amount,
          frequency: s.frequency,
          fee_type: s.fee_type,
          updated_at: now,
          updated_by: actorUserId,
        });
        created += 1;
      }

      if (created > 0) {
        await this.audit.record(client, {
          tenantId,
          actorUserId,
          entityTable: "fee_structures",
          entityId: dto.to_session_id,
          action: "create",
          summary: `Carried forward ${created} fee structure(s) to new session`,
        });
      }

      return { created };
    });
  }

  // Recomputes a student's active discounts against their own non-voided,
  // pending/partial invoices in the *current session only* -- never
  // touches paid/voided history. Called when a discount is assigned with
  // "apply to existing invoices" checked. The caller always owns the
  // transaction and passes its client in.
  async reapplyDiscountsForStudent(tenantId: string, actorUserId: string, studentId: string, client: PoolClient): Promise<void> {
    const student = await findOneForTenant<StudentRow>(client, "students", tenantId, studentId);
    if (!student) {
      throw new NotFoundException("student not found");
    }

    let currentSessionId: string;
    try {
      currentSessionId = await this.resolveCurrentSessionIdTx(client, tenantId);
    } catch {
      return;
    }

    const invoicesResult = await client.query<FeeInvoiceRow & { fee_type: string }>(
      `SELECT fi.*, fs.fee_type
       FROM fee_invoices fi
       JOIN fee_structures fs ON fs.id = fi.fee_structure_id
       WHERE fi.tenant_id = $1 AND fi.student_id = $2 AND fi.deleted_at IS NULL
         AND fi.status IN ('pending', 'partial') AND fi.academic_session_id = $3`,
      [tenantId, studentId, currentSessionId],
    );

    const now = new Date();
    for (const invoice of invoicesResult.rows) {
      const feeCategoryResult = await client.query<{ id: string }>(
        "SELECT id FROM fee_categories WHERE tenant_id = $1 AND key = $2",
        [tenantId, invoice.fee_type],
      );
      const feeCategoryId = feeCategoryResult.rows[0]?.id ?? null;
      const gross = invoice.gross_amount || invoice.amount_due;
      const { discountAmount, applied } = await this.computeDiscount(
        client,
        tenantId,
        studentId,
        feeCategoryId,
        gross,
        invoice.due_date ?? now,
      );
      const newAmountDue = Math.max(gross - discountAmount, 0);
      if (newAmountDue < invoice.amount_paid) {
        throw new BadRequestException(
          `cannot apply discount: invoice ${invoice.id} already has more paid than the new amount due -- reverse the excess payment first`,
        );
      }

      await client.query("DELETE FROM fee_invoice_discounts WHERE fee_invoice_id = $1", [invoice.id]);
      await updateRow<FeeInvoiceRow>(client, "fee_invoices", tenantId, invoice.id, {
        gross_amount: gross,
        discount_amount: discountAmount,
        amount_due: newAmountDue,
        status: invoiceStatus(newAmountDue, invoice.amount_paid),
        updated_at: now,
        updated_by: actorUserId,
      });
      for (const a of applied) {
        await insertRow(client, "fee_invoice_discounts", tenantId, {
          fee_invoice_id: invoice.id,
          fee_discount_id: a.feeDiscountId,
          amount: a.amount,
          created_at: now,
          updated_at: now,
        });
      }
    }
  }

  private toListItem(invoice: FeeInvoiceListRow, guardianName: string | null) {
    return {
      id: invoice.id,
      student_id: invoice.student_id,
      student_name: [invoice.student_first_name, invoice.student_last_name].filter(Boolean).join(" "),
      class_name: invoice.class_name,
      section_name: invoice.section_name,
      roll_number: invoice.roll_number,
      date_of_birth: invoice.date_of_birth,
      guardian_name: guardianName,
      fee_structure_name: invoice.fee_structure_name,
      fee_type: invoice.fee_type,
      period_label: invoice.period_label,
      gross_amount: invoice.gross_amount,
      discount_amount: invoice.discount_amount,
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      due_date: invoice.due_date,
      status: displayStatus(invoice.status, invoice.due_date),
    };
  }
}
