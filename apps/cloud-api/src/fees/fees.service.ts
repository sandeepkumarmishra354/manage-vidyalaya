import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateFeeStructureDto } from "./dto/create-fee-structure.dto.js";
import type { RecordPaymentBatchDto } from "./dto/record-payment-batch.dto.js";
import type { RecordPaymentDto } from "./dto/record-payment.dto.js";
import type { UpdateFeeStructureDto } from "./dto/update-fee-structure.dto.js";

function invoiceStatus(amountDue: number, amountPaid: number): string {
  if (amountPaid >= amountDue) return "paid";
  if (amountPaid > 0) return "partial";
  return "pending";
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

  // Fee categories are tenant-extensible (FeeCategoriesModule), not a
  // static enum, so fee_type is checked against the tenant's own category
  // list here rather than via a class-validator constraint.
  private async assertValidFeeType(tenantId: string, feeType: string) {
    const category = await this.prisma.feeCategory.findFirst({ where: { tenantId, key: feeType, deletedAt: null } });
    if (!category) {
      throw new BadRequestException(`unknown fee category '${feeType}'`);
    }
  }

  async createFeeStructure(tenantId: string, dto: CreateFeeStructureDto) {
    const feeType = dto.fee_type ?? "tuition";
    await this.assertValidFeeType(tenantId, feeType);

    return this.prisma.feeStructure.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: dto.branch_id,
        academicSessionId: dto.academic_session_id,
        classId: dto.class_id ?? null,
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
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.feeStructure.update({
        where: { id },
        data: {
          name: dto.name,
          amount: dto.amount,
          frequency: dto.frequency,
          feeType: dto.fee_type,
          classId: dto.class_id ?? null,
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

  // Creates one invoice per enrolled student covered by the structure (its
  // class, or every class in the branch if class_id is null), skipping
  // students who already have an invoice for it. Returns the created count.
  // Accepts an optional transaction client so the bulk path
  // (generateInvoicesBulk) can share this exact implementation across
  // several structures inside one transaction, rather than duplicating it.
  async generateInvoices(
    tenantId: string,
    feeStructureId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;

    const structure = await client.feeStructure.findUnique({ where: { id: feeStructureId } });
    if (!structure) {
      throw new NotFoundException("fee structure not found");
    }

    const students = await client.student.findMany({
      where: {
        branchId: structure.branchId,
        deletedAt: null,
        status: "enrolled",
        ...(structure.classId ? { currentClassId: structure.classId } : {}),
      },
      select: { id: true },
    });

    const existing = await client.feeInvoice.findMany({
      where: { feeStructureId, studentId: { in: students.map((s) => s.id) } },
      select: { studentId: true },
    });
    const alreadyInvoiced = new Set(existing.map((i) => i.studentId));

    const toCreate = students.filter((s) => !alreadyInvoiced.has(s.id));
    if (toCreate.length === 0) {
      return 0;
    }

    const now = new Date();
    await client.feeInvoice.createMany({
      data: toCreate.map((s) => ({
        id: randomUUID(),
        tenantId,
        branchId: structure.branchId,
        studentId: s.id,
        feeStructureId,
        academicSessionId: structure.academicSessionId,
        amountDue: structure.amount,
        amountPaid: 0,
        status: "pending",
        updatedAt: now,
      })),
    });

    return toCreate.length;
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
        const created = await this.generateInvoices(tenantId, structure.id, tx);
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

  async listInvoices(branchId: string, status?: string, feeType?: string, classId?: string) {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        branchId,
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(feeType ? { feeStructure: { feeType } } : {}),
        ...(classId ? { student: { currentClassId: classId } } : {}),
      },
      include: { student: true, feeStructure: true },
      orderBy: [{ dueDate: "asc" }, { student: { firstName: "asc" } }],
    });

    return invoices.map((i) => this.toListItem(i));
  }

  async getStudentFeeSummary(studentId: string) {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { studentId, deletedAt: null },
      include: { student: true, feeStructure: true },
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
  // accordingly -- the core logic shared by both the single-payment and
  // batch/combined-payment paths, so they don't duplicate the
  // amount/status-recompute logic.
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
    const paymentId = randomUUID();

    const payment = await tx.feePayment.create({
      data: {
        id: paymentId,
        tenantId,
        invoiceId: entry.invoiceId,
        amount: entry.amount,
        paymentMethod: entry.paymentMethod,
        paymentDate: new Date(entry.paymentDate),
        receiptNumber: entry.receiptNumber,
        remarks: entry.remarks,
        recordedBy: actorUserId,
        updatedAt: now,
      },
    });

    const invoice = await tx.feeInvoice.findUniqueOrThrow({ where: { id: entry.invoiceId } });
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
      for (const entry of dto.entries) {
        const payment = await this.applyPayment(tx, tenantId, actorUserId, now, {
          invoiceId: entry.invoice_id,
          amount: entry.amount,
          paymentMethod: dto.payment_method,
          paymentDate: dto.payment_date,
          receiptNumber: dto.receipt_number ?? null,
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
  async reversePayment(tenantId: string, actorUserId: string, paymentId: string, reason: string) {
    const original = await this.prisma.feePayment.findFirst({ where: { id: paymentId, deletedAt: null } });
    if (!original) {
      throw new NotFoundException("payment not found");
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
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
        entityId: paymentId,
        action: "update",
        summary: `Reversed payment: ${reason}`,
      });
    });
  }

  private toListItem(invoice: {
    id: string;
    studentId: string;
    student: { firstName: string; lastName: string | null };
    feeStructure: { name: string; feeType: string };
    amountDue: number;
    amountPaid: number;
    dueDate: Date | null;
    status: string;
  }) {
    return {
      id: invoice.id,
      student_id: invoice.studentId,
      student_name: [invoice.student.firstName, invoice.student.lastName].filter(Boolean).join(" "),
      fee_structure_name: invoice.feeStructure.name,
      fee_type: invoice.feeStructure.feeType,
      amount_due: invoice.amountDue,
      amount_paid: invoice.amountPaid,
      due_date: invoice.dueDate,
      status: invoice.status,
    };
  }
}
