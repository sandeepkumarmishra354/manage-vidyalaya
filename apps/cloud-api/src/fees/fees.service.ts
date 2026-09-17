import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CarryForwardStructuresDto } from "./dto/carry-forward-structures.dto.js";
import type { CreateFeeStructureDto } from "./dto/create-fee-structure.dto.js";
import type { EditInvoiceDto } from "./dto/edit-invoice.dto.js";
import type { EditPaymentDto } from "./dto/edit-payment.dto.js";
import type { RecordPaymentBatchDto } from "./dto/record-payment-batch.dto.js";
import type { RecordPaymentDto } from "./dto/record-payment.dto.js";
import type { SetStudentFeeAssignmentDto } from "./dto/set-student-fee-assignment.dto.js";
import type { UpdateFeeStructureDto } from "./dto/update-fee-structure.dto.js";

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

// Student info needed on the printed fee receipt (name, class, roll number,
// DOB, guardian) alongside the invoice line items -- one shared include so
// both listInvoices and getStudentFeeSummary return the same shape.
const RECEIPT_STUDENT_INCLUDE = {
  currentClass: true,
  currentSection: true,
  studentGuardians: { include: { guardian: true } },
} as const;

// Picks the guardian to show on a printed document: the one flagged
// primary, falling back to the first active (non-deleted) linked guardian.
function primaryGuardianName(
  studentGuardians: { isPrimaryContact: boolean; guardian: { fullName: string; deletedAt: Date | null } }[],
): string | null {
  const active = studentGuardians.filter((sg) => sg.guardian.deletedAt === null);
  const primary = active.find((sg) => sg.isPrimaryContact) ?? active[0];
  return primary?.guardian.fullName ?? null;
}

@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listFeeStructures(branchId: string, feeType?: string, classId?: string) {
    return this.prisma.feeStructure.findMany({
      where: {
        branchId,
        deletedAt: null,
        ...(feeType ? { feeType } : {}),
        // A structure with no class (applies to the whole branch) should
        // still surface when filtering by a specific class.
        ...(classId ? { OR: [{ classId }, { classId: null }] } : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  // Every fee structure that would normally apply to a student in this
  // class (or branch-wide), scoped to one session (or session-independent)
  // -- shared by admission-time fee assignment (5g) and generateInvoices.
  async listMatchingStructures(
    tenantId: string,
    branchId: string,
    classId: string | null,
    academicSessionId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.feeStructure.findMany({
      where: {
        tenantId,
        branchId,
        deletedAt: null,
        OR: [{ classId }, { classId: null }],
        AND: [{ OR: [{ academicSessionId }, { academicSessionId: null }] }],
      },
    });
  }

  // Resolves the tenant's current academic session -- used when a fee
  // structure is session-independent (academicSessionId: null) and a
  // concrete session still needs to be stamped onto each generated invoice.
  // AcademicSession is tenant-scoped, not branch-scoped (one set of
  // sessions applies across every branch of a tenant) -- a previous version
  // of this filtered by a nonexistent branchId column, which Prisma
  // rejected with a PrismaClientValidationError surfaced to callers as a
  // raw 500.
  async resolveCurrentSessionId(tx: Prisma.TransactionClient | PrismaService, tenantId: string): Promise<string> {
    const session = await tx.academicSession.findFirst({ where: { tenantId, isCurrent: true, deletedAt: null } });
    if (!session) {
      throw new BadRequestException("no current academic session set for this tenant");
    }
    return session.id;
  }

  // Fee categories are tenant-extensible (FeeCategoriesModule), not a
  // static enum, so fee_type is checked against the tenant's own category
  // list here rather than via a class-validator constraint.
  private async assertValidFeeType(tenantId: string, feeType: string) {
    const category = await this.prisma.feeCategory.findFirst({ where: { tenantId, key: feeType, deletedAt: null } });
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

    return this.prisma.feeStructure.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: dto.branch_id,
        academicSessionId,
        classId,
        name: dto.name,
        amount: dto.amount,
        frequency: dto.frequency,
        feeType,
        updatedAt: new Date(),
      },
    });
  }

  async updateFeeStructure(tenantId: string, actorUserId: string, id: string, dto: UpdateFeeStructureDto) {
    await this.assertValidFeeType(tenantId, dto.fee_type);
    const academicSessionId = dto.academic_session_id ?? null;
    const classId = dto.class_id ?? null;
    this.assertSessionClassCombo(academicSessionId, classId);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.feeStructure.update({
        where: { id },
        data: {
          name: dto.name,
          amount: dto.amount,
          frequency: dto.frequency,
          feeType: dto.fee_type,
          classId,
          academicSessionId,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
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
    session: { startDate: Date; endDate: Date },
    upToPeriod?: string,
  ): { label: string; dueDate: Date | null }[] {
    if (structure.frequency !== "monthly" && structure.frequency !== "quarterly") {
      return [{ label: "", dueDate: null }];
    }

    const sessionStart = new Date(Date.UTC(session.startDate.getUTCFullYear(), session.startDate.getUTCMonth(), 1));
    const sessionEnd = new Date(Date.UTC(session.endDate.getUTCFullYear(), session.endDate.getUTCMonth(), 1));

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
      const yearLabel = `${session.startDate.getUTCFullYear()}-${String(session.endDate.getUTCFullYear()).slice(-2)}`;
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
    client: Prisma.TransactionClient,
    tenantId: string,
    studentId: string,
    feeCategoryId: string | null,
    grossAmount: number,
    asOf: Date,
  ): Promise<{ discountAmount: number; applied: { feeDiscountId: string; amount: number }[] }> {
    const assignments = await client.studentFeeDiscount.findMany({
      where: { tenantId, studentId, deletedAt: null },
      include: { feeDiscount: true },
      orderBy: { updatedAt: "asc" },
    });

    let remaining = grossAmount;
    const applied: { feeDiscountId: string; amount: number }[] = [];

    for (const a of assignments) {
      const d = a.feeDiscount;
      if (!d.isActive || d.deletedAt) continue;
      if (d.feeCategoryId && d.feeCategoryId !== feeCategoryId) continue;
      if (d.validFrom && asOf < d.validFrom) continue;
      if (d.validTo && asOf > d.validTo) continue;
      if (remaining <= 0) continue;

      const amount = d.discountType === "percentage" ? Math.round((grossAmount * d.value) / 100) : d.value;
      const capped = Math.min(amount, remaining);
      if (capped <= 0) continue;

      applied.push({ feeDiscountId: d.id, amount: capped });
      remaining -= capped;
    }

    return { discountAmount: grossAmount - remaining, applied };
  }

  // Generates every still-missing period-invoice for one student against
  // one structure (a single "" invoice for one_time/annual; one per period
  // through upToPeriod for monthly/quarterly), applying that student's
  // active discounts as each row is created. Extracted so it's reusable
  // both from generateInvoices' per-student loop and directly, for a
  // single student -- an "include" override (5b) or admission confirmation
  // (5g) taking immediate effect without regenerating the whole structure.
  async generateInvoiceForStudent(
    tenantId: string,
    studentId: string,
    feeStructureId: string,
    tx: Prisma.TransactionClient,
    upToPeriod?: string,
  ): Promise<number> {
    const structure = await tx.feeStructure.findUniqueOrThrow({ where: { id: feeStructureId } });
    const sessionId = structure.academicSessionId ?? (await this.resolveCurrentSessionId(tx, tenantId));
    const session = await tx.academicSession.findUniqueOrThrow({ where: { id: sessionId } });
    const feeCategory = await tx.feeCategory.findFirst({ where: { tenantId, key: structure.feeType } });

    const periods = this.periodsFor(structure, session, upToPeriod);

    const existing = await tx.feeInvoice.findMany({
      where: { feeStructureId, studentId },
      select: { periodLabel: true },
    });
    const existingLabels = new Set(existing.map((i) => i.periodLabel));

    const toCreate = periods.filter((p) => !existingLabels.has(p.label));
    if (toCreate.length === 0) return 0;

    const now = new Date();
    for (const p of toCreate) {
      const { discountAmount, applied } = await this.computeDiscount(
        tx,
        tenantId,
        studentId,
        feeCategory?.id ?? null,
        structure.amount,
        p.dueDate ?? now,
      );
      const amountDue = Math.max(structure.amount - discountAmount, 0);
      const invoiceId = randomUUID();

      await tx.feeInvoice.create({
        data: {
          id: invoiceId,
          tenantId,
          branchId: structure.branchId,
          studentId,
          feeStructureId,
          academicSessionId: sessionId,
          periodLabel: p.label,
          grossAmount: structure.amount,
          discountAmount,
          amountDue,
          amountPaid: 0,
          dueDate: p.dueDate,
          status: "pending",
          updatedAt: now,
        },
      });

      if (applied.length > 0) {
        await tx.feeInvoiceDiscount.createMany({
          data: applied.map((a) => ({
            id: randomUUID(),
            tenantId,
            feeInvoiceId: invoiceId,
            feeDiscountId: a.feeDiscountId,
            amount: a.amount,
            createdAt: now,
          })),
        });
      }
    }

    return toCreate.length;
  }

  // Creates invoices for every eligible student covered by the structure:
  // (its class, or every class in the branch, if class_id is null) union
  // any per-student "include" override, minus any "exclude" override.
  // Accepts an optional transaction client so the bulk path
  // (generateInvoicesBulk) can share this exact implementation across
  // several structures inside one transaction. Returns the created count.
  async generateInvoices(
    tenantId: string,
    feeStructureId: string,
    tx?: Prisma.TransactionClient,
    upToPeriod?: string,
  ): Promise<number> {
    const run = async (client: Prisma.TransactionClient) => {
      const structure = await client.feeStructure.findUnique({ where: { id: feeStructureId } });
      if (!structure) {
        throw new NotFoundException("fee structure not found");
      }

      const classWideStudents = await client.student.findMany({
        where: {
          branchId: structure.branchId,
          deletedAt: null,
          status: "enrolled",
          ...(structure.classId ? { currentClassId: structure.classId } : {}),
        },
        select: { id: true },
      });

      const assignments = await client.studentFeeAssignment.findMany({
        where: { feeStructureId, deletedAt: null },
        select: { studentId: true, mode: true },
      });

      const eligibleIds = new Set(classWideStudents.map((s) => s.id));
      for (const a of assignments) {
        if (a.mode === "include") eligibleIds.add(a.studentId);
      }
      for (const a of assignments) {
        if (a.mode === "exclude") eligibleIds.delete(a.studentId);
      }

      let created = 0;
      for (const studentId of eligibleIds) {
        created += await this.generateInvoiceForStudent(tenantId, studentId, feeStructureId, client, upToPeriod);
      }
      return created;
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
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
    const structures = await this.prisma.feeStructure.findMany({
      where: {
        tenantId,
        branchId,
        academicSessionId,
        deletedAt: null,
        ...(feeStructureIds && feeStructureIds.length > 0 ? { id: { in: feeStructureIds } } : {}),
      },
    });

    return this.prisma.$transaction(async (tx) => {
      const byStructure: { fee_structure_id: string; created: number }[] = [];
      for (const structure of structures) {
        const created = await this.generateInvoices(tenantId, structure.id, tx, upToPeriod);
        byStructure.push({ fee_structure_id: structure.id, created });
      }

      const total = byStructure.reduce((sum, r) => sum + r.created, 0);

      if (total > 0) {
        await this.audit.record(tx, {
          tenantId,
          branchId,
          actorUserId,
          entityTable: "fee_invoices",
          entityId: branchId,
          action: "create",
          summary: `Bulk-generated ${total} invoice(s) across ${structures.length} fee structure(s)`,
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
  async setStudentFeeAssignment(tenantId: string, actorUserId: string, dto: SetStudentFeeAssignmentDto) {
    const structure = await this.prisma.feeStructure.findFirst({
      where: { id: dto.fee_structure_id, tenantId, deletedAt: null },
    });
    if (!structure) {
      throw new NotFoundException("fee structure not found");
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.studentFeeAssignment.findFirst({
        where: { studentId: dto.student_id, feeStructureId: dto.fee_structure_id },
      });

      const assignment = existing
        ? await tx.studentFeeAssignment.update({
            where: { id: existing.id },
            data: {
              mode: dto.mode,
              reason: dto.reason ?? null,
              deletedAt: null,
              updatedAt: now,
              updatedBy: actorUserId,
              version: { increment: 1 },
            },
          })
        : await tx.studentFeeAssignment.create({
            data: {
              id: randomUUID(),
              tenantId,
              branchId: structure.branchId,
              studentId: dto.student_id,
              feeStructureId: dto.fee_structure_id,
              mode: dto.mode,
              reason: dto.reason ?? null,
              updatedAt: now,
              updatedBy: actorUserId,
            },
          });

      if (dto.mode === "exclude") {
        const invoices = await tx.feeInvoice.findMany({
          where: {
            studentId: dto.student_id,
            feeStructureId: dto.fee_structure_id,
            deletedAt: null,
            status: { not: "voided" },
          },
        });
        if (invoices.some((i) => i.amountPaid > 0)) {
          throw new BadRequestException(
            "this student has a payment recorded against this fee -- reverse it before excluding them",
          );
        }
        for (const invoice of invoices) {
          await tx.feeInvoice.update({
            where: { id: invoice.id },
            data: { status: "voided", updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
          });
        }
      }

      await this.audit.record(tx, {
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
        await this.generateInvoiceForStudent(tenantId, dto.student_id, dto.fee_structure_id, tx);
      }

      return assignment;
    });
  }

  async removeStudentFeeAssignment(tenantId: string, actorUserId: string, id: string) {
    const existing = await this.prisma.studentFeeAssignment.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("assignment not found");
    }
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.studentFeeAssignment.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
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

  async listStructureAssignments(feeStructureId: string) {
    const rows = await this.prisma.studentFeeAssignment.findMany({
      where: { feeStructureId, deletedAt: null },
      include: { student: { include: { currentClass: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      student_id: r.studentId,
      student_name: [r.student.firstName, r.student.lastName].filter(Boolean).join(" "),
      class_name: r.student.currentClass?.name ?? null,
      mode: r.mode,
      reason: r.reason,
    }));
  }

  async listStudentFeeAssignments(studentId: string) {
    const rows = await this.prisma.studentFeeAssignment.findMany({
      where: { studentId, deletedAt: null },
      include: { feeStructure: true },
    });
    return rows.map((r) => ({
      id: r.id,
      fee_structure_id: r.feeStructureId,
      fee_structure_name: r.feeStructure.name,
      mode: r.mode,
      reason: r.reason,
    }));
  }

  async voidInvoice(tenantId: string, actorUserId: string, invoiceId: string, reason: string) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.feeInvoice.update({
        where: { id: invoiceId },
        data: { status: "voided", updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
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

  async editInvoice(tenantId: string, actorUserId: string, invoiceId: string, dto: EditInvoiceDto) {
    const invoice = await this.prisma.feeInvoice.findFirst({ where: { id: invoiceId, deletedAt: null } });
    if (!invoice) {
      throw new NotFoundException("invoice not found");
    }
    if (invoice.status === "voided") {
      throw new BadRequestException("cannot edit a voided invoice");
    }
    if (dto.amount_due < invoice.amountPaid) {
      throw new BadRequestException("amount due cannot be less than the amount already paid");
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.feeInvoice.update({
        where: { id: invoiceId },
        data: {
          amountDue: dto.amount_due,
          dueDate: dto.due_date !== undefined ? (dto.due_date ? new Date(dto.due_date) : null) : invoice.dueDate,
          status: invoiceStatus(dto.amount_due, invoice.amountPaid),
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
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

  async listInvoices(branchId: string, status?: string, feeType?: string, classId?: string) {
    const now = new Date();
    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        branchId,
        deletedAt: null,
        ...(status === "overdue"
          ? { status: { in: ["pending", "partial"] }, dueDate: { lt: now } }
          : status
            ? { status }
            : {}),
        ...(feeType ? { feeStructure: { feeType } } : {}),
        ...(classId ? { student: { currentClassId: classId } } : {}),
      },
      include: { student: { include: RECEIPT_STUDENT_INCLUDE }, feeStructure: true },
      orderBy: [{ dueDate: "asc" }, { student: { firstName: "asc" } }],
    });

    return invoices.map((i) => this.toListItem(i));
  }

  async getStudentFeeSummary(studentId: string) {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { studentId, deletedAt: null },
      include: { student: { include: RECEIPT_STUDENT_INCLUDE }, feeStructure: true },
      orderBy: [{ dueDate: "asc" }],
    });

    const payments = await this.prisma.feePayment.findMany({
      where: { invoice: { studentId }, deletedAt: null },
      orderBy: { paymentDate: "desc" },
    });

    const totalDue = invoices.reduce((sum, i) => sum + i.amountDue, 0);
    const totalPaid = invoices.reduce((sum, i) => sum + i.amountPaid, 0);

    return {
      invoices: invoices.map((i) => this.toListItem(i)),
      payments: payments.map((p) => ({
        id: p.id,
        invoice_id: p.invoiceId,
        amount: p.amount,
        payment_method: p.paymentMethod,
        payment_date: p.paymentDate,
        receipt_number: p.receiptNumber,
      })),
      total_due: totalDue,
      total_paid: totalPaid,
    };
  }

  // Creates one FeePayment row and updates its invoice's amount_paid/status
  // accordingly -- the core logic shared by the single-payment,
  // batch/combined-payment, and edit-payment (reverse-then-reapply) paths.
  // Auto-generates a receipt number when the caller doesn't supply one, so
  // every payment is reprint-able.
  private async applyPayment(
    tx: Prisma.TransactionClient,
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
  ) {
    const invoice = await tx.feeInvoice.findUniqueOrThrow({ where: { id: entry.invoiceId } });
    const receiptNumber = entry.receiptNumber ?? generateReceiptNumber(invoice.branchId);
    const paymentId = randomUUID();

    const payment = await tx.feePayment.create({
      data: {
        id: paymentId,
        tenantId,
        invoiceId: entry.invoiceId,
        amount: entry.amount,
        paymentMethod: entry.paymentMethod,
        paymentDate: new Date(entry.paymentDate),
        receiptNumber,
        remarks: entry.remarks,
        recordedBy: actorUserId,
        updatedAt: now,
      },
    });

    const newPaid = invoice.amountPaid + entry.amount;
    await tx.feeInvoice.update({
      where: { id: entry.invoiceId },
      data: {
        amountPaid: newPaid,
        status: invoiceStatus(invoice.amountDue, newPaid),
        updatedAt: now,
        version: { increment: 1 },
      },
    });

    return payment;
  }

  // Records a payment and updates the invoice's amount_paid/status
  // accordingly, in one transaction.
  async recordPayment(tenantId: string, actorUserId: string, dto: RecordPaymentDto) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const payment = await this.applyPayment(tx, tenantId, actorUserId, now, {
        invoiceId: dto.invoice_id,
        amount: dto.amount,
        paymentMethod: dto.payment_method,
        paymentDate: dto.payment_date,
        receiptNumber: dto.receipt_number ?? null,
        remarks: dto.remarks ?? null,
      });

      await this.audit.record(tx, {
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
  async recordPaymentBatch(tenantId: string, actorUserId: string, dto: RecordPaymentBatchDto) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const payments = [];
      let sharedReceiptNumber = dto.receipt_number ?? null;
      if (!sharedReceiptNumber) {
        const firstInvoice = await tx.feeInvoice.findUniqueOrThrow({ where: { id: dto.entries[0].invoice_id } });
        sharedReceiptNumber = generateReceiptNumber(firstInvoice.branchId);
      }
      for (const entry of dto.entries) {
        const payment = await this.applyPayment(tx, tenantId, actorUserId, now, {
          invoiceId: entry.invoice_id,
          amount: entry.amount,
          paymentMethod: dto.payment_method,
          paymentDate: dto.payment_date,
          receiptNumber: sharedReceiptNumber,
          remarks: dto.remarks ?? null,
        });
        payments.push(payment);
      }

      const total = dto.entries.reduce((sum, e) => sum + e.amount, 0);

      await this.audit.record(tx, {
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
  // Extracted from reversePayment so editPayment can compose it with a
  // fresh applyPayment inside one transaction.
  private async reversePaymentTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    now: Date,
    original: { id: string; invoiceId: string; amount: number; paymentMethod: string },
    reason: string,
  ) {
    await tx.feePayment.create({
      data: {
        id: randomUUID(),
        tenantId,
        invoiceId: original.invoiceId,
        amount: -original.amount,
        paymentMethod: original.paymentMethod,
        paymentDate: now,
        remarks: `Reversal: ${reason}`,
        recordedBy: actorUserId,
        updatedAt: now,
      },
    });

    const invoice = await tx.feeInvoice.findUniqueOrThrow({ where: { id: original.invoiceId } });
    const newPaid = invoice.amountPaid - original.amount;

    await tx.feeInvoice.update({
      where: { id: original.invoiceId },
      data: {
        amountPaid: newPaid,
        status: invoiceStatus(invoice.amountDue, newPaid),
        updatedAt: now,
        version: { increment: 1 },
      },
    });

    await this.audit.record(tx, {
      tenantId,
      actorUserId,
      entityTable: "fee_payments",
      entityId: original.id,
      action: "update",
      summary: `Reversed payment: ${reason}`,
    });
  }

  async reversePayment(tenantId: string, actorUserId: string, paymentId: string, reason: string) {
    const original = await this.prisma.feePayment.findFirst({ where: { id: paymentId, deletedAt: null } });
    if (!original) {
      throw new NotFoundException("payment not found");
    }

    const now = new Date();
    return this.prisma.$transaction((tx) => this.reversePaymentTx(tx, tenantId, actorUserId, now, original, reason));
  }

  // Implemented as reverse-then-reapply in one transaction -- the
  // corrected row keeps the original receipt_number, so a reprint after an
  // edit still shows one consistent receipt.
  async editPayment(tenantId: string, actorUserId: string, paymentId: string, dto: EditPaymentDto) {
    const original = await this.prisma.feePayment.findFirst({ where: { id: paymentId, deletedAt: null } });
    if (!original) {
      throw new NotFoundException("payment not found");
    }
    if (original.amount < 0) {
      throw new BadRequestException("cannot edit a reversal entry");
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await this.reversePaymentTx(tx, tenantId, actorUserId, now, original, `Correcting payment (${dto.reason})`);

      const corrected = await this.applyPayment(tx, tenantId, actorUserId, now, {
        invoiceId: original.invoiceId,
        amount: dto.amount,
        paymentMethod: dto.payment_method,
        paymentDate: dto.payment_date,
        receiptNumber: original.receiptNumber,
        remarks: dto.remarks ?? original.remarks,
      });

      await this.audit.record(tx, {
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
  async getPaymentReceipt(tenantId: string, receiptNumber: string) {
    const payments = await this.prisma.feePayment.findMany({
      where: { tenantId, receiptNumber, deletedAt: null },
      include: { invoice: { include: { student: { include: RECEIPT_STUDENT_INCLUDE }, feeStructure: true } } },
      orderBy: { paymentDate: "asc" },
    });
    if (payments.length === 0) {
      throw new NotFoundException("receipt not found");
    }

    return payments.map((p) => ({
      payment: {
        id: p.id,
        amount: p.amount,
        payment_method: p.paymentMethod,
        payment_date: p.paymentDate,
        receipt_number: p.receiptNumber,
        remarks: p.remarks,
      },
      invoice: this.toListItem(p.invoice),
    }));
  }

  async listPayments(
    tenantId: string,
    branchId: string,
    filters: { from?: string; to?: string; studentId?: string; receiptNumber?: string },
  ) {
    const payments = await this.prisma.feePayment.findMany({
      where: {
        tenantId,
        deletedAt: null,
        invoice: { branchId, ...(filters.studentId ? { studentId: filters.studentId } : {}) },
        ...(filters.receiptNumber ? { receiptNumber: filters.receiptNumber } : {}),
        ...(filters.from || filters.to
          ? {
              paymentDate: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      include: { invoice: { include: { student: { include: RECEIPT_STUDENT_INCLUDE }, feeStructure: true } } },
      orderBy: { paymentDate: "desc" },
    });

    return payments.map((p) => ({
      id: p.id,
      invoice_id: p.invoiceId,
      student_id: p.invoice.studentId,
      student_name: [p.invoice.student.firstName, p.invoice.student.lastName].filter(Boolean).join(" "),
      fee_structure_name: p.invoice.feeStructure.name,
      amount: p.amount,
      payment_method: p.paymentMethod,
      payment_date: p.paymentDate,
      receipt_number: p.receiptNumber,
      remarks: p.remarks,
    }));
  }

  // Clones every non-deleted, session-scoped fee structure from one
  // session to another, remapping class_id via the same mapping student
  // promotion already builds. Session-independent structures need nothing
  // carried forward -- they already apply to the new session automatically.
  async carryForwardStructures(tenantId: string, actorUserId: string, dto: CarryForwardStructuresDto) {
    const structures = await this.prisma.feeStructure.findMany({
      where: { tenantId, academicSessionId: dto.from_session_id, deletedAt: null },
    });

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      let created = 0;
      for (const s of structures) {
        const newClassId = s.classId ? (dto.class_mapping[s.classId] ?? null) : null;
        if (s.classId && !newClassId) continue;

        await tx.feeStructure.create({
          data: {
            id: randomUUID(),
            tenantId,
            branchId: s.branchId,
            academicSessionId: dto.to_session_id,
            classId: newClassId,
            name: s.name,
            amount: s.amount,
            frequency: s.frequency,
            feeType: s.feeType,
            updatedAt: now,
            updatedBy: actorUserId,
          },
        });
        created += 1;
      }

      if (created > 0) {
        await this.audit.record(tx, {
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
  // "apply to existing invoices" checked.
  async reapplyDiscountsForStudent(
    tenantId: string,
    actorUserId: string,
    studentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (client: Prisma.TransactionClient) => {
      await client.student.findUniqueOrThrow({ where: { id: studentId } });
      let currentSessionId: string;
      try {
        currentSessionId = await this.resolveCurrentSessionId(client, tenantId);
      } catch {
        return;
      }

      const invoices = await client.feeInvoice.findMany({
        where: {
          studentId,
          deletedAt: null,
          status: { in: ["pending", "partial"] },
          academicSessionId: currentSessionId,
        },
        include: { feeStructure: true },
      });

      const now = new Date();
      for (const invoice of invoices) {
        const feeCategory = await client.feeCategory.findFirst({
          where: { tenantId, key: invoice.feeStructure.feeType },
        });
        const gross = invoice.grossAmount || invoice.amountDue;
        const { discountAmount, applied } = await this.computeDiscount(
          client,
          tenantId,
          studentId,
          feeCategory?.id ?? null,
          gross,
          invoice.dueDate ?? now,
        );
        const newAmountDue = Math.max(gross - discountAmount, 0);
        if (newAmountDue < invoice.amountPaid) {
          throw new BadRequestException(
            `cannot apply discount: invoice ${invoice.id} already has more paid than the new amount due -- reverse the excess payment first`,
          );
        }

        await client.feeInvoiceDiscount.deleteMany({ where: { feeInvoiceId: invoice.id } });
        await client.feeInvoice.update({
          where: { id: invoice.id },
          data: {
            grossAmount: gross,
            discountAmount,
            amountDue: newAmountDue,
            status: invoiceStatus(newAmountDue, invoice.amountPaid),
            updatedAt: now,
            updatedBy: actorUserId,
            version: { increment: 1 },
          },
        });
        if (applied.length > 0) {
          await client.feeInvoiceDiscount.createMany({
            data: applied.map((a) => ({
              id: randomUUID(),
              tenantId,
              feeInvoiceId: invoice.id,
              feeDiscountId: a.feeDiscountId,
              amount: a.amount,
              createdAt: now,
            })),
          });
        }
      }
    };

    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  private toListItem(invoice: {
    id: string;
    studentId: string;
    student: {
      firstName: string;
      lastName: string | null;
      rollNumber: string | null;
      dateOfBirth: Date | null;
      currentClass: { name: string } | null;
      currentSection: { name: string } | null;
      studentGuardians: { isPrimaryContact: boolean; guardian: { fullName: string; deletedAt: Date | null } }[];
    };
    feeStructure: { name: string; feeType: string };
    periodLabel: string;
    grossAmount: number;
    discountAmount: number;
    amountDue: number;
    amountPaid: number;
    dueDate: Date | null;
    status: string;
  }) {
    return {
      id: invoice.id,
      student_id: invoice.studentId,
      student_name: [invoice.student.firstName, invoice.student.lastName].filter(Boolean).join(" "),
      class_name: invoice.student.currentClass?.name ?? null,
      section_name: invoice.student.currentSection?.name ?? null,
      roll_number: invoice.student.rollNumber,
      date_of_birth: invoice.student.dateOfBirth,
      guardian_name: primaryGuardianName(invoice.student.studentGuardians),
      fee_structure_name: invoice.feeStructure.name,
      fee_type: invoice.feeStructure.feeType,
      period_label: invoice.periodLabel,
      gross_amount: invoice.grossAmount,
      discount_amount: invoice.discountAmount,
      amount_due: invoice.amountDue,
      amount_paid: invoice.amountPaid,
      due_date: invoice.dueDate,
      status: displayStatus(invoice.status, invoice.dueDate),
    };
  }
}
