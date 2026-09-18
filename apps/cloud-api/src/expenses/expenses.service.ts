import { randomUUID } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { RequestUploadUrlDto } from "../documents/dto/request-upload-url.dto.js";
import { StorageService } from "../storage/storage.service.js";
import type { CreateExpenseDto } from "./dto/create-expense.dto.js";
import type { UpdateExpenseDto } from "./dto/update-expense.dto.js";

export interface ExpenseRow extends TenantRow {
  branch_id: string;
  category_id: string | null;
  description: string;
  amount: number;
  expense_date: Date;
  payment_mode: string | null;
  vendor_name: string | null;
  receipt_storage_key: string | null;
  recorded_by_user_id: string;
  created_at: Date;
}

function sanitizeExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  return fileName
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);
}

function toListItem(e: ExpenseRow) {
  return {
    id: e.id,
    branch_id: e.branch_id,
    category_id: e.category_id,
    description: e.description,
    amount: e.amount,
    expense_date: e.expense_date,
    payment_mode: e.payment_mode,
    vendor_name: e.vendor_name,
    has_receipt: e.receipt_storage_key !== null,
    recorded_by_user_id: e.recorded_by_user_id,
    created_at: e.created_at,
  };
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly db: DbService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async create(tenantId: string, actorUserId: string, dto: CreateExpenseDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      const created = await insertRow<ExpenseRow>(client, "expenses", tenantId, {
        branch_id: dto.branch_id,
        category_id: dto.category_id ?? null,
        description: dto.description,
        amount: dto.amount,
        expense_date: new Date(dto.expense_date),
        payment_mode: dto.payment_mode ?? null,
        vendor_name: dto.vendor_name ?? null,
        recorded_by_user_id: actorUserId,
        created_at: now,
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "expenses",
        entityId: created.id,
        action: "create",
        summary: `Recorded expense '${dto.description}'`,
      });

      return toListItem(created);
    });
  }

  async list(tenantId: string, branchId: string, from?: string, to?: string, categoryId?: string) {
    const conditions = ["tenant_id = $1", "branch_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [tenantId, branchId];
    if (categoryId) {
      values.push(categoryId);
      conditions.push(`category_id = $${values.length}`);
    }
    if (from) {
      values.push(new Date(from));
      conditions.push(`expense_date >= $${values.length}`);
    }
    if (to) {
      values.push(new Date(to));
      conditions.push(`expense_date <= $${values.length}`);
    }

    const rows = await this.db.query<ExpenseRow>(
      tenantId,
      `SELECT * FROM expenses WHERE ${conditions.join(" AND ")} ORDER BY expense_date DESC`,
      values,
    );
    return rows.map(toListItem);
  }

  private async findOwned(tenantId: string, id: string) {
    const row = await this.db.queryOne<ExpenseRow>(
      tenantId,
      "SELECT * FROM expenses WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL",
      [id, tenantId],
    );
    if (!row) {
      throw new NotFoundException("expense not found");
    }
    return row;
  }

  async update(tenantId: string, actorUserId: string, id: string, dto: UpdateExpenseDto) {
    const existing = await this.findOwned(tenantId, id);

    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<ExpenseRow>(client, "expenses", tenantId, id, {
        category_id: dto.category_id ?? null,
        description: dto.description,
        amount: dto.amount,
        expense_date: new Date(dto.expense_date),
        payment_mode: dto.payment_mode ?? null,
        vendor_name: dto.vendor_name ?? null,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: existing.branch_id,
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

    await this.db.withTransaction(tenantId, async (client) => {
      await updateRow<ExpenseRow>(client, "expenses", tenantId, id, {
        deleted_at: new Date(),
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: existing.branch_id,
        actorUserId,
        entityTable: "expenses",
        entityId: id,
        action: "delete",
        summary: `Deleted expense '${existing.description}'`,
      });
    });

    if (existing.receipt_storage_key) {
      await this.storage.deleteObject(existing.receipt_storage_key);
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
    const previousKey = existing.receipt_storage_key;

    const updated = await this.db.withTransaction(tenantId, (client) =>
      updateRow<ExpenseRow>(client, "expenses", tenantId, id, {
        receipt_storage_key: storageKey,
        updated_at: new Date(),
        updated_by: actorUserId,
      }),
    );

    if (previousKey && previousKey !== storageKey) {
      await this.storage.deleteObject(previousKey);
    }

    return toListItem(updated);
  }

  async getReceiptDownloadUrl(tenantId: string, id: string) {
    const existing = await this.findOwned(tenantId, id);
    if (!existing.receipt_storage_key) {
      throw new NotFoundException("no receipt attached to this expense");
    }
    return this.storage.createDownloadUrl(existing.receipt_storage_key);
  }

  async summary(tenantId: string, branchId: string, from?: string, to?: string) {
    const conditions = ["tenant_id = $1", "branch_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [tenantId, branchId];
    if (from) {
      values.push(new Date(from));
      conditions.push(`expense_date >= $${values.length}`);
    }
    if (to) {
      values.push(new Date(to));
      conditions.push(`expense_date <= $${values.length}`);
    }
    const where = conditions.join(" AND ");

    const [byCategory, rows] = await Promise.all([
      this.db.query<{ category_id: string | null; amount: string }>(
        tenantId,
        `SELECT category_id, COALESCE(SUM(amount), 0)::text AS amount FROM expenses WHERE ${where} GROUP BY category_id`,
        values,
      ),
      this.db.query<{ amount: number; expense_date: Date }>(
        tenantId,
        `SELECT amount, expense_date FROM expenses WHERE ${where}`,
        values,
      ),
    ]);

    const byMonth = new Map<string, number>();
    let total = 0;
    for (const row of rows) {
      total += row.amount;
      const month = row.expense_date.toISOString().slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + row.amount);
    }

    return {
      total,
      by_category: byCategory.map((c) => ({ category_id: c.category_id, amount: Number(c.amount) })),
      by_month: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount })),
    };
  }
}
