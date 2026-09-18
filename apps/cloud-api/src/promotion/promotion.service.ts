import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import type { CreatePromotionBatchDto } from "./dto/create-promotion-batch.dto.js";
import type { SetPromotionDecisionDto } from "./dto/set-promotion-decision.dto.js";

interface PromotionBatchRow {
  id: string;
  tenant_id: string;
  branch_id: string;
  from_session_id: string;
  to_session_id: string;
  class_mapping_json: Record<string, string>;
  status: string;
  executed_at: Date | null;
  executed_by: string | null;
  created_at: Date;
}

export interface PromotionBatchItemRow {
  id: string;
  tenant_id: string;
  promotion_batch_id: string;
  student_id: string;
  from_class_id: string | null;
  from_section_id: string | null;
  to_class_id: string | null;
  to_section_id: string | null;
  decision: string;
  remarks: string | null;
}

@Injectable()
export class PromotionService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  // Suggests a target class for each source class by matching
  // sort_order + 1 ("the next class up") rather than by name. Classes with
  // no match (typically the highest class, whose students graduate) come
  // back with suggested_to_class_id: null for the admin to resolve manually.
  async suggestClassMapping(tenantId: string, branchId: string, fromSessionId: string, toSessionId: string) {
    const [fromClasses, toClasses] = await Promise.all([
      this.db.query<{ id: string; name: string; sort_order: number }>(
        tenantId,
        "SELECT id, name, sort_order FROM classes WHERE tenant_id = $1 AND branch_id = $2 AND academic_session_id = $3 AND deleted_at IS NULL ORDER BY sort_order ASC",
        [tenantId, branchId, fromSessionId],
      ),
      this.db.query<{ id: string; sort_order: number }>(
        tenantId,
        "SELECT id, sort_order FROM classes WHERE tenant_id = $1 AND branch_id = $2 AND academic_session_id = $3 AND deleted_at IS NULL",
        [tenantId, branchId, toSessionId],
      ),
    ]);

    return fromClasses.map((c) => ({
      from_class_id: c.id,
      from_class_name: c.name,
      suggested_to_class_id: toClasses.find((tc) => tc.sort_order === c.sort_order + 1)?.id ?? null,
    }));
  }

  async createPromotionBatch(tenantId: string, actorUserId: string, dto: CreatePromotionBatchDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const batchId = randomUUID();
      const now = new Date();
      const fromClassIds = Object.keys(dto.class_mapping);

      await client.query(
        `INSERT INTO promotion_batches (id, tenant_id, branch_id, from_session_id, to_session_id, class_mapping_json, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7)`,
        [batchId, tenantId, dto.branch_id, dto.from_session_id, dto.to_session_id, JSON.stringify(dto.class_mapping), now],
      );

      const studentsResult = await client.query<{ id: string; current_class_id: string | null; current_section_id: string | null }>(
        `SELECT id, current_class_id, current_section_id FROM students
         WHERE tenant_id = $1 AND branch_id = $2 AND status = 'enrolled' AND deleted_at IS NULL AND current_class_id = ANY($3)`,
        [tenantId, dto.branch_id, fromClassIds],
      );

      for (const student of studentsResult.rows) {
        const toClassId = student.current_class_id ? (dto.class_mapping[student.current_class_id] ?? null) : null;
        await client.query(
          `INSERT INTO promotion_batch_items (id, tenant_id, promotion_batch_id, student_id, from_class_id, from_section_id, to_class_id, to_section_id, decision)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'promote')`,
          [randomUUID(), tenantId, batchId, student.id, student.current_class_id, student.current_section_id, toClassId],
        );
      }

      await this.audit.record(client, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "promotion_batches",
        entityId: batchId,
        action: "create",
        summary: "Created promotion batch (draft)",
      });

      return this.loadBatch(client, tenantId, batchId);
    });
  }

  async getPromotionBatch(tenantId: string, batchId: string) {
    return this.db.withTransaction(tenantId, (client) => this.loadBatch(client, tenantId, batchId));
  }

  private async loadBatch(client: PoolClient, tenantId: string, batchId: string) {
    const batchResult = await client.query<PromotionBatchRow>(
      "SELECT * FROM promotion_batches WHERE id = $1 AND tenant_id = $2",
      [batchId, tenantId],
    );
    const batch = batchResult.rows[0];
    if (!batch) {
      throw new NotFoundException("promotion batch not found");
    }

    const itemsResult = await client.query<
      PromotionBatchItemRow & {
        first_name: string;
        last_name: string | null;
        from_class_name: string | null;
        to_class_name: string | null;
      }
    >(
      `SELECT i.*, s.first_name, s.last_name, fc.name AS from_class_name, tc.name AS to_class_name
       FROM promotion_batch_items i
       JOIN students s ON s.id = i.student_id
       LEFT JOIN classes fc ON fc.id = i.from_class_id
       LEFT JOIN classes tc ON tc.id = i.to_class_id
       WHERE i.tenant_id = $1 AND i.promotion_batch_id = $2
       ORDER BY s.first_name ASC`,
      [tenantId, batchId],
    );

    return {
      id: batch.id,
      branch_id: batch.branch_id,
      from_session_id: batch.from_session_id,
      to_session_id: batch.to_session_id,
      status: batch.status,
      items: itemsResult.rows.map((i) => ({
        id: i.id,
        student_id: i.student_id,
        student_name: [i.first_name, i.last_name].filter(Boolean).join(" "),
        from_class_name: i.from_class_name,
        to_class_id: i.to_class_id,
        to_class_name: i.to_class_name,
        to_section_id: i.to_section_id,
        decision: i.decision,
      })),
    };
  }

  async setPromotionDecision(tenantId: string, itemId: string, dto: SetPromotionDecisionDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const result = await client.query<PromotionBatchItemRow>(
        `UPDATE promotion_batch_items SET decision = $1, to_class_id = $2, to_section_id = $3
         WHERE id = $4 AND tenant_id = $5 RETURNING *`,
        [dto.decision, dto.to_class_id ?? null, dto.to_section_id ?? null, itemId, tenantId],
      );
      const updated = result.rows[0];
      if (!updated) {
        throw new NotFoundException("promotion batch item not found");
      }
      return updated;
    });
  }

  // Applies every item's decision transactionally: promote inserts a
  // student_enrollments row for the new session and moves the student's
  // current class/section pointer; retain inserts an enrollment row back
  // into the *same* class (repeating the year) and leaves the pointer
  // as-is; withdraw marks the student withdrawn and writes no new-session
  // enrollment row. One audit_log row covers the whole batch.
  async executePromotionBatch(tenantId: string, actorUserId: string, batchId: string) {
    return this.db.withTransaction(tenantId, async (client) => {
      const batchResult = await client.query<PromotionBatchRow>(
        "SELECT * FROM promotion_batches WHERE id = $1 AND tenant_id = $2",
        [batchId, tenantId],
      );
      const batch = batchResult.rows[0];
      if (!batch) {
        throw new NotFoundException("promotion batch not found");
      }
      if (batch.status === "completed") {
        throw new BadRequestException("promotion batch already executed");
      }

      const itemsResult = await client.query<PromotionBatchItemRow>(
        "SELECT * FROM promotion_batch_items WHERE tenant_id = $1 AND promotion_batch_id = $2",
        [tenantId, batchId],
      );
      const now = new Date();

      for (const item of itemsResult.rows) {
        if (item.decision === "promote") {
          if (!item.to_class_id) {
            continue; // no target class chosen -- skip, admin must resolve
          }
          await client.query(
            `INSERT INTO student_enrollments (id, tenant_id, branch_id, student_id, academic_session_id, class_id, section_id, status, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'promoted', $8)
             ON CONFLICT (student_id, academic_session_id) DO UPDATE SET
               class_id = EXCLUDED.class_id, section_id = EXCLUDED.section_id, status = 'promoted',
               updated_at = EXCLUDED.updated_at, version = student_enrollments.version + 1`,
            [randomUUID(), tenantId, batch.branch_id, item.student_id, batch.to_session_id, item.to_class_id, item.to_section_id, now],
          );

          await client.query(
            "UPDATE students SET current_class_id = $1, current_section_id = $2, updated_at = $3, version = version + 1 WHERE id = $4 AND tenant_id = $5",
            [item.to_class_id, item.to_section_id, now, item.student_id, tenantId],
          );
        } else if (item.decision === "retain") {
          const studentResult = await client.query<{ current_class_id: string | null }>(
            "SELECT current_class_id FROM students WHERE id = $1 AND tenant_id = $2",
            [item.student_id, tenantId],
          );
          const student = studentResult.rows[0];
          if (!student) {
            throw new NotFoundException("student not found");
          }
          if (!student.current_class_id) {
            continue;
          }
          await client.query(
            `INSERT INTO student_enrollments (id, tenant_id, branch_id, student_id, academic_session_id, class_id, section_id, status, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'retained', $8)
             ON CONFLICT (student_id, academic_session_id) DO UPDATE SET
               class_id = EXCLUDED.class_id, section_id = EXCLUDED.section_id, status = 'retained',
               updated_at = EXCLUDED.updated_at, version = student_enrollments.version + 1`,
            [randomUUID(), tenantId, batch.branch_id, item.student_id, batch.to_session_id, student.current_class_id, item.from_section_id, now],
          );
        } else if (item.decision === "withdraw") {
          await client.query(
            "UPDATE students SET status = 'withdrawn', updated_at = $1, version = version + 1 WHERE id = $2 AND tenant_id = $3",
            [now, item.student_id, tenantId],
          );
        }
      }

      await client.query(
        "UPDATE promotion_batches SET status = 'completed', executed_at = $1, executed_by = $2 WHERE id = $3 AND tenant_id = $4",
        [now, actorUserId, batchId, tenantId],
      );

      await this.audit.record(client, {
        tenantId,
        branchId: batch.branch_id,
        actorUserId,
        entityTable: "promotion_batches",
        entityId: batchId,
        action: "update",
        summary: `Executed promotion batch (${itemsResult.rows.length} students)`,
      });
    });
  }
}
