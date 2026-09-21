import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { findOneForTenant, insertRow, softDeleteRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import { FeesService } from "../fees/fees.service.js";
import { StudentsService } from "../students/students.service.js";
import type { AssignDiscountDto } from "./dto/assign-discount.dto.js";
import type { CreateFeeDiscountDto } from "./dto/create-fee-discount.dto.js";
import type { UpdateFeeDiscountDto } from "./dto/update-fee-discount.dto.js";

export interface FeeDiscountRow extends TenantRow {
  name: string;
  key: string;
  discount_type: "percentage" | "flat";
  value: number;
  fee_category_id: string | null;
  is_active: boolean;
  valid_from: Date | null;
  valid_to: Date | null;
}

export interface StudentFeeDiscountRow extends TenantRow {
  student_id: string;
  fee_discount_id: string;
  reason: string | null;
}

// A stable slug (matches FeeCategory's convention) derived from the display
// name -- e.g. "Sibling Discount" -> "sibling_discount".
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

@Injectable()
export class FeeDiscountsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly feesService: FeesService,
    private readonly studentsService: StudentsService,
  ) {}

  listDiscounts(tenantId: string) {
    return this.db.query<FeeDiscountRow>(
      tenantId,
      "SELECT * FROM fee_discounts WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC",
      [tenantId],
    );
  }

  async createDiscount(tenantId: string, actorUserId: string, dto: CreateFeeDiscountDto) {
    const key = slugify(dto.name);
    if (!key) {
      throw new BadRequestException("invalid discount name");
    }

    return this.db.withTransaction(tenantId, async (client) => {
      const existingResult = await client.query<FeeDiscountRow>(
        "SELECT * FROM fee_discounts WHERE tenant_id = $1 AND key = $2 AND deleted_at IS NULL",
        [tenantId, key],
      );
      if (existingResult.rows[0]) {
        throw new ConflictException("a fee discount with this name already exists");
      }

      const created = await insertRow<FeeDiscountRow>(client, "fee_discounts", tenantId, {
        name: dto.name,
        key,
        discount_type: dto.discount_type,
        value: dto.value,
        fee_category_id: dto.fee_category_id ?? null,
        is_active: true,
        valid_from: dto.valid_from ? new Date(dto.valid_from) : null,
        valid_to: dto.valid_to ? new Date(dto.valid_to) : null,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "fee_discounts",
        entityId: created.id,
        action: "create",
        summary: `Created fee discount '${dto.name}'`,
      });

      return created;
    });
  }

  async updateDiscount(tenantId: string, actorUserId: string, id: string, dto: UpdateFeeDiscountDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<FeeDiscountRow>(client, "fee_discounts", tenantId, id);
      if (!existing) {
        throw new NotFoundException("fee discount not found");
      }

      const updated = await updateRow<FeeDiscountRow>(client, "fee_discounts", tenantId, id, {
        name: dto.name,
        discount_type: dto.discount_type,
        value: dto.value,
        fee_category_id: dto.fee_category_id ?? null,
        is_active: dto.is_active ?? existing.is_active,
        valid_from: dto.valid_from !== undefined ? (dto.valid_from ? new Date(dto.valid_from) : null) : existing.valid_from,
        valid_to: dto.valid_to !== undefined ? (dto.valid_to ? new Date(dto.valid_to) : null) : existing.valid_to,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "fee_discounts",
        entityId: id,
        action: "update",
        summary: `Updated fee discount '${dto.name}'`,
      });

      return updated;
    });
  }

  // Blocked while any active (non-deleted) student assignment exists --
  // deleting it out from under assigned students would silently strip
  // their discount from future invoices.
  async deleteDiscount(tenantId: string, actorUserId: string, id: string) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<FeeDiscountRow>(client, "fee_discounts", tenantId, id);
      if (!existing) {
        throw new NotFoundException("fee discount not found");
      }

      const assignedResult = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM student_fee_discounts WHERE tenant_id = $1 AND fee_discount_id = $2 AND deleted_at IS NULL",
        [tenantId, id],
      );
      const assignedCount = Number(assignedResult.rows[0]?.count ?? "0");
      if (assignedCount > 0) {
        throw new BadRequestException("cannot delete a discount that is still assigned to students");
      }

      const deleted = await softDeleteRow<FeeDiscountRow>(client, "fee_discounts", tenantId, id, actorUserId);

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "fee_discounts",
        entityId: id,
        action: "delete",
        summary: `Deleted fee discount '${existing.name}'`,
      });

      return deleted;
    });
  }

  async assignDiscountToStudents(tenantId: string, actorUserId: string, feeDiscountId: string, dto: AssignDiscountDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const discount = await findOneForTenant<FeeDiscountRow>(client, "fee_discounts", tenantId, feeDiscountId);
      if (!discount) {
        throw new NotFoundException("fee discount not found");
      }

      const studentsResult = await client.query<{ id: string }>(
        "SELECT id FROM students WHERE tenant_id = $1 AND id = ANY($2) AND deleted_at IS NULL",
        [tenantId, dto.student_ids],
      );
      const validStudentIds = new Set(studentsResult.rows.map((r) => r.id));
      const missing = dto.student_ids.filter((id) => !validStudentIds.has(id));
      if (missing.length > 0) {
        throw new BadRequestException("one or more students were not found");
      }

      const now = new Date();
      const assignedStudentIds: string[] = [];
      for (const studentId of dto.student_ids) {
        const existingResult = await client.query<StudentFeeDiscountRow>(
          "SELECT * FROM student_fee_discounts WHERE tenant_id = $1 AND student_id = $2 AND fee_discount_id = $3",
          [tenantId, studentId, feeDiscountId],
        );
        const existing = existingResult.rows[0];
        if (existing) {
          await updateRow<StudentFeeDiscountRow>(client, "student_fee_discounts", tenantId, existing.id, {
            reason: dto.reason ?? null,
            deleted_at: null,
            updated_at: now,
            updated_by: actorUserId,
          });
        } else {
          await insertRow<StudentFeeDiscountRow>(client, "student_fee_discounts", tenantId, {
            student_id: studentId,
            fee_discount_id: feeDiscountId,
            reason: dto.reason ?? null,
            updated_at: now,
            updated_by: actorUserId,
          });
        }
        assignedStudentIds.push(studentId);
      }

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "student_fee_discounts",
        entityId: feeDiscountId,
        action: "create",
        summary: `Assigned discount '${discount.name}' to ${assignedStudentIds.length} student(s)`,
      });

      if (dto.apply_to_existing_invoices) {
        for (const studentId of assignedStudentIds) {
          await this.feesService.reapplyDiscountsForStudent(tenantId, actorUserId, studentId, client);
        }
      }

      return { assigned: assignedStudentIds.length };
    });
  }

  async removeDiscountAssignment(tenantId: string, actorUserId: string, assignmentId: string) {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<StudentFeeDiscountRow>(
        client,
        "student_fee_discounts",
        tenantId,
        assignmentId,
      );
      if (!existing) {
        throw new NotFoundException("assignment not found");
      }

      const updated = await softDeleteRow<StudentFeeDiscountRow>(
        client,
        "student_fee_discounts",
        tenantId,
        assignmentId,
        actorUserId,
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "student_fee_discounts",
        entityId: assignmentId,
        action: "delete",
        summary: "Removed fee discount assignment",
      });

      return updated;
    });
  }

  async listStudentDiscounts(tenantId: string, studentId: string) {
    const rows = await this.db.query<
      StudentFeeDiscountRow & { discount_name: string; discount_type: "percentage" | "flat"; value: number }
    >(
      tenantId,
      `SELECT sfd.id, sfd.student_id, sfd.fee_discount_id, sfd.reason,
              fd.name AS discount_name, fd.discount_type, fd.value
       FROM student_fee_discounts sfd
       JOIN fee_discounts fd ON fd.id = sfd.fee_discount_id
       WHERE sfd.tenant_id = $1 AND sfd.student_id = $2 AND sfd.deleted_at IS NULL`,
      [tenantId, studentId],
    );
    return rows.map((r) => ({
      id: r.id,
      fee_discount_id: r.fee_discount_id,
      fee_discount_name: r.discount_name,
      discount_type: r.discount_type,
      value: r.value,
      reason: r.reason,
    }));
  }

  async listDiscountAssignees(tenantId: string, feeDiscountId: string) {
    const rows = await this.db.query<{
      id: string;
      student_id: string;
      first_name: string;
      last_name: string | null;
      class_name: string | null;
      reason: string | null;
    }>(
      tenantId,
      `SELECT sfd.id, sfd.student_id, s.first_name, s.last_name, c.name AS class_name, sfd.reason
       FROM student_fee_discounts sfd
       JOIN students s ON s.id = sfd.student_id
       LEFT JOIN classes c ON c.id = s.current_class_id
       WHERE sfd.tenant_id = $1 AND sfd.fee_discount_id = $2 AND sfd.deleted_at IS NULL`,
      [tenantId, feeDiscountId],
    );
    return rows.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      student_name: [r.first_name, r.last_name].filter(Boolean).join(" "),
      class_name: r.class_name,
      reason: r.reason,
    }));
  }

  // Thin pass-through to the existing sibling lookup -- powers a "Suggest
  // siblings" helper when assigning a discount like "sibling discount".
  suggestSiblingsForDiscount(tenantId: string, studentId: string, branchId: string | null) {
    return this.studentsService.getSiblings(tenantId, studentId, branchId);
  }
}
