import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { FeesService } from "./fees.service.js";

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
}

// The real service composes many small parameterized queries across
// generateInvoiceForStudent/generateInvoices/generateInvoicesBulk and
// setStudentFeeAssignment -- too deep to hand-order with a flat
// mockResolvedValueOnce chain without the tests becoming unreadable and
// brittle to any reordering. This router instead dispatches by matching
// each query's SQL shape (and, where needed, its bound params) against a
// small test fixture, the same way the real tables would answer them.
interface RouterState {
  structuresById: Record<string, Record<string, unknown> | undefined>;
  bulkStructures: Record<string, unknown>[];
  sessionsById: Record<string, Record<string, unknown> | undefined>;
  currentSessionId: string | null;
  studentsQueue: Record<string, unknown>[][];
  assignmentsByStructure: Record<string, Record<string, unknown>[]>;
  studentFeeAssignmentByKey: Record<string, Record<string, unknown> | undefined>;
  invoicesForExcludeByKey: Record<string, Record<string, unknown>[]>;
  existingLabelsByKey: Record<string, string[]>;
  feeCategoryId: string | null;
}

function makeRoutedClient(overrides: Partial<RouterState> = {}): FakeClient {
  const state: RouterState = {
    structuresById: {},
    bulkStructures: [],
    sessionsById: {},
    currentSessionId: null,
    studentsQueue: [],
    assignmentsByStructure: {},
    studentFeeAssignmentByKey: {},
    invoicesForExcludeByKey: {},
    existingLabelsByKey: {},
    feeCategoryId: null,
    ...overrides,
  };
  let insertCounter = 0;
  const client: FakeClient = { query: vi.fn() };

  client.query.mockImplementation(async (text: string, params: unknown[] = []) => {
    if (/FROM fee_structures WHERE id = \$1/.test(text)) {
      const row = state.structuresById[params[0] as string];
      return { rows: row ? [row] : [] };
    }
    if (/FROM fee_structures WHERE tenant_id = \$1 AND branch_id = \$2 AND academic_session_id = \$3/.test(text)) {
      return { rows: state.bulkStructures };
    }
    if (/FROM students WHERE tenant_id/.test(text)) {
      return { rows: state.studentsQueue.shift() ?? [] };
    }
    if (/FROM student_fee_assignments WHERE tenant_id = \$1 AND fee_structure_id = \$2/.test(text)) {
      return { rows: state.assignmentsByStructure[params[1] as string] ?? [] };
    }
    if (/FROM student_fee_assignments WHERE tenant_id = \$1 AND student_id = \$2 AND fee_structure_id = \$3/.test(text)) {
      const row = state.studentFeeAssignmentByKey[`${params[1]}:${params[2]}`];
      return { rows: row ? [row] : [] };
    }
    if (/FROM fee_invoices WHERE tenant_id = \$1 AND student_id = \$2 AND fee_structure_id = \$3/.test(text)) {
      return { rows: state.invoicesForExcludeByKey[`${params[1]}:${params[2]}`] ?? [] };
    }
    if (/FROM academic_sessions WHERE id = \$1 AND tenant_id = \$2/.test(text)) {
      const row = state.sessionsById[params[0] as string];
      return { rows: row ? [row] : [] };
    }
    if (/FROM academic_sessions WHERE tenant_id = \$1 AND is_current/.test(text)) {
      const row = state.currentSessionId ? state.sessionsById[state.currentSessionId] : undefined;
      return { rows: row ? [{ id: row.id }] : [] };
    }
    if (/FROM fee_categories WHERE tenant_id = \$1 AND key = \$2/.test(text)) {
      return { rows: state.feeCategoryId ? [{ id: state.feeCategoryId }] : [] };
    }
    if (/SELECT period_label FROM fee_invoices WHERE fee_structure_id = \$1 AND student_id = \$2/.test(text)) {
      const labels = state.existingLabelsByKey[`${params[0]}:${params[1]}`] ?? [];
      return { rows: labels.map((label) => ({ period_label: label })) };
    }
    if (/FROM student_fee_discounts sfd/.test(text)) {
      return { rows: [] };
    }
    if (/INSERT INTO fee_structures /.test(text)) {
      insertCounter += 1;
      return { rows: [{ id: `struct-${insertCounter}`, tenant_id: "tenant-1" }] };
    }
    if (/INSERT INTO fee_invoices /.test(text)) {
      insertCounter += 1;
      return { rows: [{ id: `inv-${insertCounter}`, tenant_id: "tenant-1" }] };
    }
    if (/INSERT INTO fee_invoice_discounts/.test(text)) {
      return { rows: [{}] };
    }
    if (/INSERT INTO student_fee_assignments/.test(text)) {
      insertCounter += 1;
      return { rows: [{ id: `assign-${insertCounter}`, tenant_id: "tenant-1" }] };
    }
    if (/UPDATE student_fee_assignments SET/.test(text)) {
      return { rows: [{ id: "assign-updated", tenant_id: "tenant-1" }] };
    }
    if (/UPDATE fee_invoices SET/.test(text)) {
      return { rows: [{ id: "inv-updated", tenant_id: "tenant-1" }] };
    }
    return { rows: [] };
  });

  return client;
}

function makeDbMock(client: FakeClient) {
  return {
    withTransaction: vi.fn(async (_tenantId: string, fn: (client: FakeClient) => unknown) => fn(client)),
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn(),
  } as unknown as DbService & {
    query: ReturnType<typeof vi.fn>;
    queryOne: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("FeesService.createFeeStructure", () => {
  let client: FakeClient;
  let db: ReturnType<typeof makeDbMock>;
  let service: FeesService;

  beforeEach(() => {
    client = makeRoutedClient();
    db = makeDbMock(client);
    service = new FeesService(db, makeAuditMock());
  });

  it("rejects a fee_type with no matching FeeCategory for the tenant", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    await expect(
      service.createFeeStructure("tenant-1", {
        branch_id: "branch-1",
        academic_session_id: "session-1",
        name: "Sports",
        amount: 500000,
        frequency: "annual",
        fee_type: "sports",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  it("defaults to 'tuition' and accepts it when a matching category exists", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "cat-1" });

    await service.createFeeStructure("tenant-1", {
      branch_id: "branch-1",
      academic_session_id: "session-1",
      name: "Tuition",
      amount: 1000000,
      frequency: "annual",
    });

    expect(db.queryOne).toHaveBeenCalledWith("tenant-1", expect.any(String), ["tenant-1", "tuition"]);
    const insertCall = client.query.mock.calls.find(([text]) => /INSERT INTO fee_structures/.test(text as string));
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain("tuition");
  });

  it("rejects a session-independent structure (academic_session_id: null) with a non-null class_id", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "cat-1" });

    await expect(
      service.createFeeStructure("tenant-1", {
        branch_id: "branch-1",
        academic_session_id: null,
        class_id: "class-1",
        name: "Tuition",
        amount: 1000000,
        frequency: "annual",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  it("accepts a session-independent, branch-wide structure", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "cat-1" });

    await service.createFeeStructure("tenant-1", {
      branch_id: "branch-1",
      academic_session_id: null,
      name: "Library fee",
      amount: 50000,
      frequency: "annual",
    });

    const insertCall = client.query.mock.calls.find(([text]) => /INSERT INTO fee_structures/.test(text as string));
    expect(insertCall![1]).toContain("Library fee");
    expect(insertCall![1]).toContain(50000);
  });
});

describe("FeesService.generateInvoices / generateInvoicesBulk", () => {
  let db: ReturnType<typeof makeDbMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: FeesService;

  const session1 = { id: "session-1", start_date: new Date("2026-04-01"), end_date: new Date("2027-03-31") };

  beforeEach(() => {
    audit = makeAuditMock();
  });

  it("loops generateInvoices across every matching structure and sums the created count", async () => {
    const client = makeRoutedClient({
      bulkStructures: [{ id: "struct-1" }, { id: "struct-2" }],
      structuresById: {
        "struct-1": {
          id: "struct-1",
          branch_id: "branch-1",
          class_id: null,
          academic_session_id: "session-1",
          amount: 1000,
          frequency: "annual",
          fee_type: "tuition",
        },
        "struct-2": {
          id: "struct-2",
          branch_id: "branch-1",
          class_id: null,
          academic_session_id: "session-1",
          amount: 1000,
          frequency: "annual",
          fee_type: "tuition",
        },
      },
      sessionsById: { "session-1": session1 },
      studentsQueue: [[{ id: "student-1" }, { id: "student-2" }], [{ id: "student-1" }]],
    });
    db = makeDbMock(client);
    service = new FeesService(db, audit);

    const result = await service.generateInvoicesBulk("tenant-1", "actor-1", "branch-1", "session-1");

    expect(result.created).toBe(3);
    expect(result.by_structure).toEqual([
      { fee_structure_id: "struct-1", created: 2 },
      { fee_structure_id: "struct-2", created: 1 },
    ]);
    expect(client.query.mock.calls.filter(([text]) => /INSERT INTO fee_invoices /.test(text as string))).toHaveLength(3);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("scopes to the given fee_structure_ids subset when provided", async () => {
    const client = makeRoutedClient({ bulkStructures: [] });
    db = makeDbMock(client);
    service = new FeesService(db, audit);

    await service.generateInvoicesBulk("tenant-1", "actor-1", "branch-1", "session-1", ["struct-1"]);

    const [text, params] = client.query.mock.calls[0];
    expect(text as string).toMatch(/id = ANY/);
    expect(params).toEqual(["tenant-1", "branch-1", "session-1", ["struct-1"]]);
  });

  it("skips the audit record when nothing was created", async () => {
    const client = makeRoutedClient({ bulkStructures: [] });
    db = makeDbMock(client);
    service = new FeesService(db, audit);

    const result = await service.generateInvoicesBulk("tenant-1", "actor-1", "branch-1", "session-1");

    expect(result.created).toBe(0);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("includes a student with an 'include' override even outside the structure's class", async () => {
    const client = makeRoutedClient({
      bulkStructures: [{ id: "struct-1" }],
      structuresById: {
        "struct-1": {
          id: "struct-1",
          branch_id: "branch-1",
          class_id: "class-1",
          academic_session_id: "session-1",
          amount: 1000,
          frequency: "annual",
          fee_type: "tuition",
        },
      },
      sessionsById: { "session-1": session1 },
      studentsQueue: [[]],
      assignmentsByStructure: { "struct-1": [{ student_id: "student-9", mode: "include" }] },
    });
    db = makeDbMock(client);
    service = new FeesService(db, audit);

    const result = await service.generateInvoicesBulk("tenant-1", "actor-1", "branch-1", "session-1");

    expect(result.created).toBe(1);
    const insertCall = client.query.mock.calls.find(([text]) => /INSERT INTO fee_invoices /.test(text as string));
    expect(insertCall![1]).toContain("student-9");
  });

  it("excludes a student with an 'exclude' override even inside the structure's class", async () => {
    const client = makeRoutedClient({
      bulkStructures: [{ id: "struct-1" }],
      structuresById: {
        "struct-1": {
          id: "struct-1",
          branch_id: "branch-1",
          class_id: null,
          academic_session_id: "session-1",
          amount: 1000,
          frequency: "annual",
          fee_type: "tuition",
        },
      },
      sessionsById: { "session-1": session1 },
      studentsQueue: [[{ id: "student-1" }]],
      assignmentsByStructure: { "struct-1": [{ student_id: "student-1", mode: "exclude" }] },
    });
    db = makeDbMock(client);
    service = new FeesService(db, audit);

    const result = await service.generateInvoicesBulk("tenant-1", "actor-1", "branch-1", "session-1");

    expect(result.created).toBe(0);
    expect(client.query.mock.calls.some(([text]) => /INSERT INTO fee_invoices /.test(text as string))).toBe(false);
  });
});

describe("FeesService.setStudentFeeAssignment", () => {
  let audit: ReturnType<typeof makeAuditMock>;

  beforeEach(() => {
    audit = makeAuditMock();
  });

  it("throws when the fee structure doesn't exist", async () => {
    const client = makeRoutedClient({ structuresById: {} });
    const db = makeDbMock(client);
    const service = new FeesService(db, audit);

    await expect(
      service.setStudentFeeAssignment("tenant-1", "actor-1", {
        student_id: "student-1",
        fee_structure_id: "struct-1",
        mode: "exclude",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("voids unpaid invoices and blocks excluding a student with a payment already recorded", async () => {
    const client = makeRoutedClient({
      structuresById: {
        "struct-1": { id: "struct-1", tenant_id: "tenant-1", name: "Tuition", branch_id: "branch-1" },
      },
      invoicesForExcludeByKey: {
        "student-1:struct-1": [{ id: "inv-1", tenant_id: "tenant-1", amount_paid: 500 }],
      },
    });
    const db = makeDbMock(client);
    const service = new FeesService(db, audit);

    await expect(
      service.setStudentFeeAssignment("tenant-1", "actor-1", {
        student_id: "student-1",
        fee_structure_id: "struct-1",
        mode: "exclude",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query.mock.calls.some(([text]) => /UPDATE fee_invoices SET/.test(text as string))).toBe(false);
  });

  it("immediately generates an invoice when mode is 'include' against a session-scoped structure", async () => {
    const session1 = { id: "session-1", start_date: new Date("2026-04-01"), end_date: new Date("2027-03-31") };
    const client = makeRoutedClient({
      structuresById: {
        "struct-1": {
          id: "struct-1",
          tenant_id: "tenant-1",
          name: "Sports Kit",
          branch_id: "branch-1",
          academic_session_id: "session-1",
          amount: 50000,
          frequency: "one_time",
          fee_type: "tuition",
          class_id: null,
        },
      },
      sessionsById: { "session-1": session1 },
    });
    const db = makeDbMock(client);
    const service = new FeesService(db, audit);

    await service.setStudentFeeAssignment("tenant-1", "actor-1", {
      student_id: "student-1",
      fee_structure_id: "struct-1",
      mode: "include",
    });

    expect(client.query.mock.calls.some(([text]) => /is_current/.test(text as string))).toBe(false);
    const insertCall = client.query.mock.calls.find(([text]) => /INSERT INTO fee_invoices /.test(text as string));
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain("student-1");
    expect(insertCall![1]).toContain("session-1");
  });

  it("immediately generates an invoice when mode is 'include' against a session-independent structure, resolving the tenant's current session", async () => {
    const currentSession = { id: "current-session", start_date: new Date("2026-04-01"), end_date: new Date("2027-03-31") };
    const client = makeRoutedClient({
      structuresById: {
        "struct-1": {
          id: "struct-1",
          tenant_id: "tenant-1",
          name: "Late Admission Fee",
          branch_id: "branch-1",
          academic_session_id: null,
          amount: 50000,
          frequency: "one_time",
          fee_type: "tuition",
          class_id: null,
        },
      },
      sessionsById: { "current-session": currentSession },
      currentSessionId: "current-session",
    });
    const db = makeDbMock(client);
    const service = new FeesService(db, audit);

    await service.setStudentFeeAssignment("tenant-1", "actor-1", {
      student_id: "student-1",
      fee_structure_id: "struct-1",
      mode: "include",
    });

    expect(client.query.mock.calls.some(([text]) => /is_current/.test(text as string))).toBe(true);
    const insertCall = client.query.mock.calls.find(([text]) => /INSERT INTO fee_invoices /.test(text as string));
    expect(insertCall![1]).toContain("current-session");
  });

  it("surfaces a clear error instead of generating an invoice when no current session exists for a session-independent structure", async () => {
    const client = makeRoutedClient({
      structuresById: {
        "struct-1": {
          id: "struct-1",
          tenant_id: "tenant-1",
          name: "Late Admission Fee",
          branch_id: "branch-1",
          academic_session_id: null,
          amount: 50000,
          frequency: "one_time",
          fee_type: "tuition",
          class_id: null,
        },
      },
      currentSessionId: null,
    });
    const db = makeDbMock(client);
    const service = new FeesService(db, audit);

    await expect(
      service.setStudentFeeAssignment("tenant-1", "actor-1", {
        student_id: "student-1",
        fee_structure_id: "struct-1",
        mode: "include",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query.mock.calls.some(([text]) => /INSERT INTO fee_invoices /.test(text as string))).toBe(false);
  });
});

describe("FeesService.recordPaymentBatch", () => {
  let client: FakeClient;
  let db: ReturnType<typeof makeDbMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: FeesService;

  beforeEach(() => {
    client = { query: vi.fn() };
    db = makeDbMock(client);
    audit = makeAuditMock();
    service = new FeesService(db, audit);
  });

  it("creates one FeePayment per entry sharing the batch's receipt number and updates each invoice independently", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "inv-1", tenant_id: "tenant-1", branch_id: "branch-1", amount_due: 1000, amount_paid: 0 }] }) // findOneForTenant inv-1
      .mockResolvedValueOnce({ rows: [{ id: "payment-1", tenant_id: "tenant-1" }] }) // insert payment 1
      .mockResolvedValueOnce({ rows: [{ id: "inv-1", tenant_id: "tenant-1" }] }) // update invoice 1
      .mockResolvedValueOnce({
        rows: [{ id: "inv-2", tenant_id: "tenant-1", branch_id: "branch-1", amount_due: 2000, amount_paid: 500 }],
      }) // findOneForTenant inv-2
      .mockResolvedValueOnce({ rows: [{ id: "payment-2", tenant_id: "tenant-1" }] }) // insert payment 2
      .mockResolvedValueOnce({ rows: [{ id: "inv-2", tenant_id: "tenant-1" }] }); // update invoice 2

    const result = await service.recordPaymentBatch("tenant-1", "actor-1", {
      entries: [
        { invoice_id: "inv-1", amount: 1000 },
        { invoice_id: "inv-2", amount: 1500 },
      ],
      payment_method: "cash",
      payment_date: "2026-01-15",
      receipt_number: "RCPT-001",
    });

    expect(result).toEqual([{ id: "payment-1", tenant_id: "tenant-1" }, { id: "payment-2", tenant_id: "tenant-1" }]);

    const insertCalls = client.query.mock.calls.filter(([text]) => /INSERT INTO fee_payments/.test(text as string));
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0][1]).toEqual(expect.arrayContaining(["inv-1", 1000, "RCPT-001"]));
    expect(insertCalls[1][1]).toEqual(expect.arrayContaining(["inv-2", 1500, "RCPT-001"]));

    const updateCalls = client.query.mock.calls.filter(([text]) => /UPDATE fee_invoices SET/.test(text as string));
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0][1]).toEqual(expect.arrayContaining([1000, "paid"]));
    expect(updateCalls[1][1]).toEqual(expect.arrayContaining([2000, "paid"]));

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ summary: expect.stringContaining("2500 paise across 2 invoice(s)") }),
    );
  });
});

describe("FeesService.editInvoice", () => {
  let client: FakeClient;
  let db: ReturnType<typeof makeDbMock>;
  let service: FeesService;

  beforeEach(() => {
    client = { query: vi.fn() };
    db = makeDbMock(client);
    service = new FeesService(db, makeAuditMock());
  });

  it("rejects editing a voided invoice", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "inv-1", tenant_id: "tenant-1", status: "voided", amount_paid: 0 }],
    });

    await expect(
      service.editInvoice("tenant-1", "actor-1", "inv-1", { amount_due: 1000, reason: "correction" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects amount_due below what's already paid", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "inv-1", tenant_id: "tenant-1", status: "pending", amount_paid: 2000 }],
    });

    await expect(
      service.editInvoice("tenant-1", "actor-1", "inv-1", { amount_due: 1000, reason: "correction" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
