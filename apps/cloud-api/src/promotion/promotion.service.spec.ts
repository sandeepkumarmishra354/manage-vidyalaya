import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { PromotionService } from "./promotion.service.js";

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
}

interface RouterState {
  batch: Record<string, unknown> | undefined;
  items: Record<string, unknown>[];
  studentsById: Record<string, { current_class_id: string | null } | undefined>;
}

function makeRoutedClient(overrides: Partial<RouterState> = {}): FakeClient {
  const state: RouterState = { batch: undefined, items: [], studentsById: {}, ...overrides };
  const client: FakeClient = { query: vi.fn() };

  client.query.mockImplementation(async (text: string, params: unknown[] = []) => {
    if (/FROM promotion_batches WHERE id = \$1/.test(text)) {
      return { rows: state.batch ? [state.batch] : [] };
    }
    if (/FROM promotion_batch_items WHERE tenant_id = \$1 AND promotion_batch_id = \$2/.test(text)) {
      return { rows: state.items };
    }
    if (/SELECT current_class_id FROM students WHERE id = \$1/.test(text)) {
      const row = state.studentsById[params[0] as string];
      return { rows: row ? [row] : [] };
    }
    return { rows: [{}] };
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

const draftBatch = { id: "batch-1", tenant_id: "tenant-a", branch_id: "branch-1", to_session_id: "session-2", status: "draft" };

describe("PromotionService.executePromotionBatch", () => {
  let audit: ReturnType<typeof makeAuditMock>;

  beforeEach(() => {
    audit = makeAuditMock();
  });

  it("refuses to re-execute an already-completed batch", async () => {
    const client = makeRoutedClient({ batch: { ...draftBatch, status: "completed" }, items: [] });
    const db = makeDbMock(client);
    const service = new PromotionService(db, audit);

    await expect(service.executePromotionBatch("tenant-a", "actor-1", "batch-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("throws NotFoundException when the batch doesn't exist for this tenant", async () => {
    const client = makeRoutedClient({ batch: undefined });
    const db = makeDbMock(client);
    const service = new PromotionService(db, audit);

    await expect(service.executePromotionBatch("tenant-a", "actor-1", "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("promote: writes a student_enrollments row and moves the current-class pointer", async () => {
    const client = makeRoutedClient({
      batch: draftBatch,
      items: [
        {
          id: "item-1",
          student_id: "student-promoted",
          decision: "promote",
          to_class_id: "class-9",
          to_section_id: "section-a",
          from_section_id: "section-old",
        },
      ],
    });
    const db = makeDbMock(client);
    const service = new PromotionService(db, audit);

    await service.executePromotionBatch("tenant-a", "actor-1", "batch-1");

    const enrollCall = client.query.mock.calls.find(([text]) => /INSERT INTO student_enrollments/.test(text as string));
    expect(enrollCall![1]).toEqual(
      expect.arrayContaining(["tenant-a", "branch-1", "student-promoted", "session-2", "class-9", "section-a"]),
    );
    const studentUpdateCall = client.query.mock.calls.find(([text]) => /UPDATE students SET current_class_id/.test(text as string));
    expect(studentUpdateCall![1]).toEqual(expect.arrayContaining(["class-9", "section-a", "student-promoted"]));
  });

  it("promote: skips an item with no target class chosen, writing nothing for it", async () => {
    const client = makeRoutedClient({
      batch: draftBatch,
      items: [{ id: "item-1", student_id: "student-unresolved", decision: "promote", to_class_id: null, to_section_id: null }],
    });
    const db = makeDbMock(client);
    const service = new PromotionService(db, audit);

    await service.executePromotionBatch("tenant-a", "actor-1", "batch-1");

    expect(client.query.mock.calls.some(([text]) => /INSERT INTO student_enrollments/.test(text as string))).toBe(false);
    expect(client.query.mock.calls.some(([text]) => /UPDATE students SET current_class_id/.test(text as string))).toBe(false);
  });

  it("retain: writes a student_enrollments row back into the same class and leaves the pointer untouched", async () => {
    const client = makeRoutedClient({
      batch: draftBatch,
      items: [{ id: "item-1", student_id: "student-retained", decision: "retain", from_section_id: "section-old" }],
      studentsById: { "student-retained": { current_class_id: "class-from" } },
    });
    const db = makeDbMock(client);
    const service = new PromotionService(db, audit);

    await service.executePromotionBatch("tenant-a", "actor-1", "batch-1");

    const enrollCall = client.query.mock.calls.find(([text]) => /INSERT INTO student_enrollments/.test(text as string));
    expect(enrollCall![1]).toEqual(expect.arrayContaining(["class-from", "section-old"]));
    // retain never moves the student's current-class pointer -- repeating
    // the year means staying in the same class, not a new enrollment row.
    expect(client.query.mock.calls.some(([text]) => /UPDATE students SET current_class_id/.test(text as string))).toBe(false);
  });

  it("withdraw: marks the student withdrawn and writes no new-session enrollment row", async () => {
    const client = makeRoutedClient({
      batch: draftBatch,
      items: [{ id: "item-1", student_id: "student-withdrawn", decision: "withdraw" }],
    });
    const db = makeDbMock(client);
    const service = new PromotionService(db, audit);

    await service.executePromotionBatch("tenant-a", "actor-1", "batch-1");

    expect(client.query.mock.calls.some(([text]) => /INSERT INTO student_enrollments/.test(text as string))).toBe(false);
    const withdrawCall = client.query.mock.calls.find(([text]) => /UPDATE students SET status = 'withdrawn'/.test(text as string));
    expect(withdrawCall![1]).toEqual(expect.arrayContaining(["student-withdrawn"]));
  });

  it("marks the batch completed and records one audit entry for the whole batch", async () => {
    const client = makeRoutedClient({
      batch: draftBatch,
      items: [
        { id: "item-1", student_id: "s1", decision: "withdraw" },
        { id: "item-2", student_id: "s2", decision: "withdraw" },
      ],
    });
    const db = makeDbMock(client);
    const service = new PromotionService(db, audit);

    await service.executePromotionBatch("tenant-a", "actor-1", "batch-1");

    const completeCall = client.query.mock.calls.find(([text]) => /UPDATE promotion_batches SET status = 'completed'/.test(text as string));
    expect(completeCall).toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(client, expect.objectContaining({ summary: expect.stringContaining("2 students") }));
  });
});
