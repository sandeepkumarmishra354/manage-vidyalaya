import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { RetentionService } from "./retention.service.js";

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
}

function makeDbMock() {
  const client: FakeClient = { query: vi.fn() };
  const db = {
    withTransaction: vi.fn(async (_tenantId: string, fn: (client: FakeClient) => unknown) => fn(client)),
    query: vi.fn(),
  } as unknown as DbService;
  return { db, client };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("RetentionService.listPolicies", () => {
  it("lazily seeds all 4 default categories when none exist yet", async () => {
    const { db, client } = makeDbMock();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // findManyForTenant: no existing rows
      .mockResolvedValueOnce({ rows: [{ id: "1", tenant_id: "t1", category: "student_identity", retention_years: 3, is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: "2", tenant_id: "t1", category: "staff_identity", retention_years: 3, is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: "3", tenant_id: "t1", category: "financial_records", retention_years: 8, is_active: false }] })
      .mockResolvedValueOnce({ rows: [{ id: "4", tenant_id: "t1", category: "academic_records", retention_years: 10, is_active: false }] });

    const service = new RetentionService(db, makeAuditMock());
    const rows = await service.listPolicies("t1");

    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.category).sort()).toEqual(
      ["academic_records", "financial_records", "staff_identity", "student_identity"].sort(),
    );
  });

  it("doesn't re-insert a category that already has a row", async () => {
    const { db, client } = makeDbMock();
    client.query.mockResolvedValueOnce({
      rows: [
        { id: "1", tenant_id: "t1", category: "student_identity", retention_years: 3, is_active: true },
        { id: "2", tenant_id: "t1", category: "staff_identity", retention_years: 3, is_active: true },
        { id: "3", tenant_id: "t1", category: "financial_records", retention_years: 8, is_active: false },
        { id: "4", tenant_id: "t1", category: "academic_records", retention_years: 10, is_active: false },
      ],
    });

    const service = new RetentionService(db, makeAuditMock());
    const rows = await service.listPolicies("t1");

    expect(rows).toHaveLength(4);
    // Only the one findManyForTenant call -- no insertRow calls follow it.
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});

describe("RetentionService.updatePolicy", () => {
  it("rejects an unknown category without touching the database", async () => {
    const { db } = makeDbMock();
    const service = new RetentionService(db, makeAuditMock());

    await expect(service.updatePolicy("t1", "actor-1", "not_a_real_category", 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  it("updates an existing policy row and records one audit entry", async () => {
    const { db, client } = makeDbMock();
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: "1", tenant_id: "t1", category: "student_identity", retention_years: 3, is_active: true }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "1", tenant_id: "t1", category: "student_identity", retention_years: 5, is_active: true }],
      });
    const audit = makeAuditMock();
    const service = new RetentionService(db, audit);

    const result = await service.updatePolicy("t1", "actor-1", "student_identity", 5);

    expect(result.retention_years).toBe(5);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("RetentionService.previewEligibleCounts", () => {
  it("returns an eligible count for active identity categories and 0 for dormant ones", async () => {
    const { db, client } = makeDbMock();
    client.query.mockResolvedValueOnce({
      rows: [
        { id: "1", tenant_id: "t1", category: "student_identity", retention_years: 3, is_active: true },
        { id: "2", tenant_id: "t1", category: "staff_identity", retention_years: 3, is_active: true },
        { id: "3", tenant_id: "t1", category: "financial_records", retention_years: 8, is_active: false },
        { id: "4", tenant_id: "t1", category: "academic_records", retention_years: 10, is_active: false },
      ],
    });
    // listPolicies sorts alphabetically, so staff_identity is previewed before
    // student_identity -- these two mocks line up with that order.
    (db.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ count: "0" }]) // staff_identity eligibility count
      .mockResolvedValueOnce([{ count: "2" }]); // student_identity eligibility count

    const service = new RetentionService(db, makeAuditMock());
    const results = await service.previewEligibleCounts("t1");

    // Only active categories are previewed -- financial_records/academic_records are dormant.
    expect(results).toEqual(
      expect.arrayContaining([
        { category: "student_identity", eligible_count: 2 },
        { category: "staff_identity", eligible_count: 0 },
      ]),
    );
    expect(results).toHaveLength(2);
  });
});
