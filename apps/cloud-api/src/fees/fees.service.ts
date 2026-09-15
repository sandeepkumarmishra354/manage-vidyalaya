import { randomUUID } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateFeeStructureDto } from "./dto/create-fee-structure.dto.js";
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

  listFeeStructures(branchId: string) {
    return this.prisma.feeStructure.findMany({
      where: { branchId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async createFeeStructure(tenantId: string, dto: CreateFeeStructureDto) {
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
        updatedAt: new Date(),
      },
    });
  }

  async updateFeeStructure(tenantId: string, actorUserId: string, id: string, dto: UpdateFeeStructureDto) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.feeStructure.update({
        where: { id },
        data: { name: dto.name, amount: dto.amount, frequency: dto.frequency, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
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
  async generateInvoices(tenantId: string, feeStructureId: string): Promise<number> {
    const structure = await this.prisma.feeStructure.findUnique({ where: { id: feeStructureId } });
    if (!structure) {
      throw new NotFoundException("fee structure not found");
    }

    const students = await this.prisma.student.findMany({
      where: {
        branchId: structure.branchId,
        deletedAt: null,
        status: "enrolled",
        ...(structure.classId ? { currentClassId: structure.classId } : {}),
      },
      select: { id: true },
    });

    const existing = await this.prisma.feeInvoice.findMany({
      where: { feeStructureId, studentId: { in: students.map((s) => s.id) } },
      select: { studentId: true },
    });
    const alreadyInvoiced = new Set(existing.map((i) => i.studentId));

    const toCreate = students.filter((s) => !alreadyInvoiced.has(s.id));
    if (toCreate.length === 0) {
      return 0;
    }

    const now = new Date();
    await this.prisma.feeInvoice.createMany({
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

  async listInvoices(branchId: string, status?: string) {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { branchId, deletedAt: null, ...(status ? { status } : {}) },
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

  // Records a payment and updates the invoice's amount_paid/status
  // accordingly, in one transaction.
  async recordPayment(tenantId: string, actorUserId: string, dto: RecordPaymentDto) {
    const now = new Date();
    const paymentId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.feePayment.create({
        data: {
          id: paymentId,
          tenantId,
          invoiceId: dto.invoice_id,
          amount: dto.amount,
          paymentMethod: dto.payment_method,
          paymentDate: new Date(dto.payment_date),
          receiptNumber: dto.receipt_number ?? null,
          remarks: dto.remarks ?? null,
          recordedBy: actorUserId,
          updatedAt: now,
        },
      });

      const invoice = await tx.feeInvoice.findUniqueOrThrow({ where: { id: dto.invoice_id } });
      const newPaid = invoice.amountPaid + dto.amount;

      await tx.feeInvoice.update({
        where: { id: dto.invoice_id },
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
        action: "create",
        summary: `Recorded payment of ${dto.amount} paise`,
      });

      return payment;
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
    feeStructure: { name: string };
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
      amount_due: invoice.amountDue,
      amount_paid: invoice.amountPaid,
      due_date: invoice.dueDate,
      status: invoice.status,
    };
  }
}
