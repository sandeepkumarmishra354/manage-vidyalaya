import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import type { FeesService } from "../fees/fees.service.js";
import type { StudentsService } from "../students/students.service.js";
import { FeeDiscountsService } from "./fee-discounts.service.js";

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
}

function makeDbMock() {
  const client: FakeClient = { query: vi.fn() };
  const db = {
    withTransaction: vi.fn(async (_tenantId: string, fn: (client: FakeClient) => unknown) => fn(client)),
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn(),
  } as unknown as DbService & {
    query: ReturnType<typeof vi.fn>;
    queryOne: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
  };
  return { db, client };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

function makeFeesMock() {
  return { reapplyDiscountsForStudent: vi.fn() } as unknown as FeesService;
}

function makeStudentsMock() {
  return { getSiblings: vi.fn() } as unknown as StudentsService;
}

describe("FeeDiscountsService.createDiscount", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let service: FeeDiscountsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new FeeDiscountsService(db, makeAuditMock(), makeFeesMock(), makeStudentsMock());
  });

  it("rejects a duplicate discount name (same slug) for the tenant", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: "existing" }] });

    await expect(
      service.createDiscount("tenant-1", "actor-1", { name: "Sibling Discount", discount_type: "percentage", value: 10 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("creates a discount with a slugified key", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] }) // duplicate check
      .mockResolvedValueOnce({ rows: [{ id: "disc-1", tenant_id: "tenant-1", key: "sibling_discount" }] }); // insert

    await service.createDiscount("tenant-1", "actor-1", { name: "Sibling Discount", discount_type: "percentage", value: 10 });

    const [, params] = client.query.mock.calls[1];
    expect(params).toContain("sibling_discount");
    expect(params).toContain("percentage");
    expect(params).toContain(10);
  });
});

describe("FeeDiscountsService.deleteDiscount", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let service: FeeDiscountsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new FeeDiscountsService(db, makeAuditMock(), makeFeesMock(), makeStudentsMock());
  });

  it("throws NotFoundException when the discount doesn't exist", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.deleteDiscount("tenant-1", "actor-1", "disc-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("blocks deletion while any active assignment exists", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "disc-1", tenant_id: "tenant-1", name: "Sibling Discount" }] })
      .mockResolvedValueOnce({ rows: [{ count: "2" }] });

    await expect(service.deleteDiscount("tenant-1", "actor-1", "disc-1")).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("FeeDiscountsService.assignDiscountToStudents", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let fees: ReturnType<typeof makeFeesMock>;
  let service: FeeDiscountsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    fees = makeFeesMock();
    service = new FeeDiscountsService(db, makeAuditMock(), fees, makeStudentsMock());
  });

  it("rejects when a student id doesn't belong to the tenant", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "disc-1", tenant_id: "tenant-1", name: "Sibling Discount" }] }) // discount lookup
      .mockResolvedValueOnce({ rows: [] }); // students validation -- none found

    await expect(
      service.assignDiscountToStudents("tenant-1", "actor-1", "disc-1", {
        student_ids: ["student-1"],
        apply_to_existing_invoices: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not reapply to existing invoices when the checkbox is unchecked", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "disc-1", tenant_id: "tenant-1", name: "Sibling Discount" }] }) // discount lookup
      .mockResolvedValueOnce({ rows: [{ id: "student-1" }] }) // students validation
      .mockResolvedValueOnce({ rows: [] }) // existing assignment check for student-1
      .mockResolvedValueOnce({ rows: [{ id: "assign-1", tenant_id: "tenant-1" }] }); // insert

    await service.assignDiscountToStudents("tenant-1", "actor-1", "disc-1", {
      student_ids: ["student-1"],
      apply_to_existing_invoices: false,
    });

    expect(fees.reapplyDiscountsForStudent).not.toHaveBeenCalled();
  });

  it("reapplies to existing invoices for every assigned student when checked", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "disc-1", tenant_id: "tenant-1", name: "Sibling Discount" }] }) // discount lookup
      .mockResolvedValueOnce({ rows: [{ id: "student-1" }, { id: "student-2" }] }) // students validation
      .mockResolvedValueOnce({ rows: [] }) // existing check student-1
      .mockResolvedValueOnce({ rows: [{ id: "assign-1", tenant_id: "tenant-1" }] }) // insert student-1
      .mockResolvedValueOnce({ rows: [] }) // existing check student-2
      .mockResolvedValueOnce({ rows: [{ id: "assign-2", tenant_id: "tenant-1" }] }); // insert student-2

    await service.assignDiscountToStudents("tenant-1", "actor-1", "disc-1", {
      student_ids: ["student-1", "student-2"],
      apply_to_existing_invoices: true,
    });

    expect(fees.reapplyDiscountsForStudent).toHaveBeenCalledTimes(2);
    expect(fees.reapplyDiscountsForStudent).toHaveBeenCalledWith("tenant-1", "actor-1", "student-1", client);
    expect(fees.reapplyDiscountsForStudent).toHaveBeenCalledWith("tenant-1", "actor-1", "student-2", client);
  });
});
