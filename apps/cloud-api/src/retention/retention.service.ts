import { BadRequestException, Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { findManyForTenant, insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import { DEFAULT_RETENTION_POLICIES, isRetentionCategory } from "./retention-categories.js";

const TABLE = "retention_policies";

// The same eligibility shape the sweep script (scripts/run-retention.ts)
// uses, kept in exactly two places (there, and here for the read-only
// preview) rather than a shared module, since a standalone tsx script has
// no NestJS DI to import this service into -- see the script's own
// comment for why it duplicates this query instead.
const IDENTITY_SWEEP_TABLES: Record<string, { table: string; statuses: string[] }> = {
  student_identity: { table: "students", statuses: ["withdrawn", "alumni"] },
  staff_identity: { table: "staff", statuses: ["relieved", "terminated", "inactive"] },
};

export interface RetentionPolicyRow extends TenantRow {
  category: string;
  retention_years: number;
  is_active: boolean;
}

@Injectable()
export class RetentionService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  // Lazily seeds any missing category row -- covers the demo tenant and
  // any tenant provisioned before this feature existed, with no one-off
  // backfill script needed. Idempotent, safe on every read.
  async listPolicies(tenantId: string): Promise<RetentionPolicyRow[]> {
    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findManyForTenant<RetentionPolicyRow>(client, TABLE, tenantId, {});
      const existingCategories = new Set(existing.map((row) => row.category));
      const now = new Date();

      for (const defaults of DEFAULT_RETENTION_POLICIES) {
        if (!existingCategories.has(defaults.category)) {
          const created = await insertRow<RetentionPolicyRow>(client, TABLE, tenantId, {
            category: defaults.category,
            retention_years: defaults.retention_years,
            is_active: defaults.is_active,
            updated_at: now,
            updated_by: null,
          });
          existing.push(created);
        }
      }

      return existing.sort((a, b) => a.category.localeCompare(b.category));
    });
  }

  async updatePolicy(
    tenantId: string,
    actorUserId: string,
    category: string,
    retentionYears: number,
  ): Promise<RetentionPolicyRow> {
    if (!isRetentionCategory(category)) {
      throw new BadRequestException(`unknown retention category '${category}'`);
    }

    return this.db.withTransaction(tenantId, async (client) => {
      const [existing] = await findManyForTenant<RetentionPolicyRow>(client, TABLE, tenantId, { category });
      const now = new Date();

      const row = existing
        ? await updateRow<RetentionPolicyRow>(client, TABLE, tenantId, existing.id, {
            retention_years: retentionYears,
            updated_at: now,
            updated_by: actorUserId,
          })
        : await insertRow<RetentionPolicyRow>(client, TABLE, tenantId, {
            category,
            retention_years: retentionYears,
            is_active: DEFAULT_RETENTION_POLICIES.find((d) => d.category === category)!.is_active,
            updated_at: now,
            updated_by: actorUserId,
          });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: TABLE,
        entityId: row.id,
        action: "update",
        summary: `Set retention period for '${category}' to ${retentionYears} year(s)`,
      });

      return row;
    });
  }

  // Read-only: runs the same eligibility WHERE clause the sweep script
  // uses but returns only a count, never row-level data, so this endpoint
  // can't itself become a data-exposure surface.
  async previewEligibleCounts(tenantId: string): Promise<{ category: string; eligible_count: number }[]> {
    const policies = await this.listPolicies(tenantId);

    return Promise.all(
      policies
        .filter((policy) => policy.is_active)
        .map(async (policy) => {
          const target = IDENTITY_SWEEP_TABLES[policy.category];
          // financial_records / academic_records aren't swept in V1, so no
          // eligibility query exists for them yet -- always 0 rather than
          // guessing at a query for data the sweep never touches.
          const eligibleCount = target ? await this.countEligible(tenantId, target.table, target.statuses, policy.retention_years) : 0;
          return { category: policy.category, eligible_count: eligibleCount };
        }),
    );
  }

  private async countEligible(tenantId: string, table: string, statuses: string[], retentionYears: number): Promise<number> {
    const rows = await this.db.query<{ count: string }>(
      tenantId,
      `SELECT COUNT(*) AS count FROM ${table}
       WHERE tenant_id = $1 AND deleted_at IS NULL AND anonymized_at IS NULL
         AND status = ANY($2) AND date_of_leaving IS NOT NULL
         AND date_of_leaving < now() - ($3 || ' years')::interval`,
      [tenantId, statuses, retentionYears],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
