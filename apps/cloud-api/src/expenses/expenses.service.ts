import { randomUUID } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import type { RequestUploadUrlDto } from "../documents/dto/request-upload-url.dto.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";
import type { CreateExpenseDto } from "./dto/create-expense.dto.js";
import type { UpdateExpenseDto } from "./dto/update-expense.dto.js";

function sanitizeExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  return fileName
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);
}

function toListItem(e: {
  id: string;
  branchId: string;
  categoryId: string | null;
  description: string;
  amount: number;
  expenseDate: Date;
  paymentMode: string | null;
  vendorName: string | null;
  receiptStorageKey: string | null;
  recordedByUserId: string;
  createdAt: Date;
}) {
  return {
    id: e.id,
    branch_id: e.branchId,
    category_id: e.categoryId,
    description: e.description,
    amount: e.amount,
    expense_date: e.expenseDate,
    payment_mode: e.paymentMode,
    vendor_name: e.vendorName,
    has_receipt: e.receiptStorageKey !== null,
    recorded_by_user_id: e.recordedByUserId,
    created_at: e.createdAt,
  };
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async create(tenantId: string, actorUserId: string, dto: CreateExpenseDto) {
    const now = new Date();
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          id,
          tenantId,
          branchId: dto.branch_id,
          categoryId: dto.category_id ?? null,
          description: dto.description,
          amount: dto.amount,
          expenseDate: new Date(dto.expense_date),
          paymentMode: dto.payment_mode ?? null,
          vendorName: dto.vendor_name ?? null,
          recordedByUserId: actorUserId,
          createdAt: now,
          updatedAt: now,
          updatedBy: actorUserId,
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "expenses",
        entityId: id,
        action: "create",
        summary: `Recorded expense '${dto.description}'`,
      });

      return toListItem(created);
    });
  }

  async list(tenantId: string, branchId: string, from?: string, to?: string, categoryId?: string) {
    const rows = await this.prisma.expense.findMany({
      where: {
        tenantId,
        branchId,
        deletedAt: null,
        ...(categoryId ? { categoryId } : {}),
        ...(from || to
          ? {
              expenseDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { expenseDate: "desc" },
    });
    return rows.map(toListItem);
  }

  private async findOwned(tenantId: string, id: string) {
    const row = await this.prisma.expense.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!row) {
      throw new NotFoundException("expense not found");
    }
    return row;
  }

  async update(tenantId: string, actorUserId: string, id: string, dto: UpdateExpenseDto) {
    const existing = await this.findOwned(tenantId, id);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: {
          categoryId: dto.category_id ?? null,
          description: dto.description,
          amount: dto.amount,
          expenseDate: new Date(dto.expense_date),
          paymentMode: dto.payment_mode ?? null,
          vendorName: dto.vendor_name ?? null,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: existing.branchId,
        actorUserId,
        entityTable: "expenses",
        entityId: id,
        action: "update",
        summary: `Updated expense '${dto.description}'`,
      });

      return toListItem(updated);
    });
  }

  async remove(tenantId: string, actorUserId: string, id: string) {
    const existing = await this.findOwned(tenantId, id);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.expense.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
      });

      await this.audit.record(tx, {
        tenantId,
        branchId: existing.branchId,
        actorUserId,
        entityTable: "expenses",
        entityId: id,
        action: "delete",
        summary: `Deleted expense '${existing.description}'`,
      });
    });

    if (existing.receiptStorageKey) {
      await this.storage.deleteObject(existing.receiptStorageKey);
    }

    return { ok: true };
  }

  async requestReceiptUploadUrl(tenantId: string, id: string, dto: RequestUploadUrlDto) {
    await this.findOwned(tenantId, id);
    const ext = sanitizeExtension(dto.file_name);
    const key = `receipt-${randomUUID()}${ext ? `.${ext}` : ""}`;
    const upload = await this.storage.createUploadUrl(key, dto.content_type);
    return { ...upload, storage_key: key };
  }

  async attachReceipt(tenantId: string, actorUserId: string, id: string, storageKey: string) {
    const existing = await this.findOwned(tenantId, id);
    const previousKey = existing.receiptStorageKey;
    const now = new Date();

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { receiptStorageKey: storageKey, updatedAt: now, updatedBy: actorUserId, version: { increment: 1 } },
    });

    if (previousKey && previousKey !== storageKey) {
      await this.storage.deleteObject(previousKey);
    }

    return toListItem(updated);
  }

  async getReceiptDownloadUrl(tenantId: string, id: string) {
    const existing = await this.findOwned(tenantId, id);
    if (!existing.receiptStorageKey) {
      throw new NotFoundException("no receipt attached to this expense");
    }
    return this.storage.createDownloadUrl(existing.receiptStorageKey);
  }

  async summary(tenantId: string, branchId: string, from?: string, to?: string) {
    const where = {
      tenantId,
      branchId,
      deletedAt: null,
      ...(from || to
        ? {
            expenseDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const [byCategory, rows] = await Promise.all([
      this.prisma.expense.groupBy({ by: ["categoryId"], where, _sum: { amount: true } }),
      this.prisma.expense.findMany({ where, select: { amount: true, expenseDate: true } }),
    ]);

    const byMonth = new Map<string, number>();
    let total = 0;
    for (const row of rows) {
      total += row.amount;
      const month = row.expenseDate.toISOString().slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + row.amount);
    }

    return {
      total,
      by_category: byCategory.map((c) => ({ category_id: c.categoryId, amount: c._sum.amount ?? 0 })),
      by_month: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount })),
    };
  }
}
