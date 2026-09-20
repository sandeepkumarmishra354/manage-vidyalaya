import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { ClassSubjectsService } from "./class-subjects.service.js";

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

// Phase 2 branch scoping: addClassSubject/createElectiveGroup fetch the
// parent class by id first -- when branchId is passed, a class outside the
// caller's branch must come back as "not found" instead of letting the
// subject/group get attached to it.
describe("ClassSubjectsService.addClassSubject branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: ClassSubjectsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new ClassSubjectsService(db, audit);
  });

  it("404s adding a subject to a class outside the caller's branch", async () => {
    client.query.mockResolvedValueOnce({ rows: [] }); // class lookup, filtered out by branch

    await expect(
      service.addClassSubject("tenant-1", "actor-1", "class-1", { subject_id: "subj-1" }, "branch-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("adds the subject when the class belongs to the caller's own branch", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "class-1", tenant_id: "tenant-1", branch_id: "branch-a" }] })
      .mockResolvedValueOnce({
        rows: [{ id: "cs-1", tenant_id: "tenant-1", branch_id: "branch-a", class_id: "class-1", subject_id: "subj-1" }],
      });

    await expect(
      service.addClassSubject("tenant-1", "actor-1", "class-1", { subject_id: "subj-1" }, "branch-a"),
    ).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("is unaffected for an unscoped (branchId: null) caller", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "class-1", tenant_id: "tenant-1", branch_id: "branch-other" }] })
      .mockResolvedValueOnce({
        rows: [{ id: "cs-1", tenant_id: "tenant-1", branch_id: "branch-other", class_id: "class-1", subject_id: "subj-1" }],
      });

    await expect(
      service.addClassSubject("tenant-1", "actor-1", "class-1", { subject_id: "subj-1" }, null),
    ).resolves.toBeDefined();
  });
});

describe("ClassSubjectsService.removeClassSubject branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: ClassSubjectsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new ClassSubjectsService(db, audit);
  });

  it("404s removing a class subject outside the caller's branch", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.removeClassSubject("tenant-1", "actor-1", "cs-1", "branch-a")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("removes a class subject within the caller's own branch", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "cs-1", tenant_id: "tenant-1", branch_id: "branch-a" }] })
      .mockResolvedValueOnce({ rows: [{ id: "cs-1", tenant_id: "tenant-1", branch_id: "branch-a" }] });

    await expect(service.removeClassSubject("tenant-1", "actor-1", "cs-1", "branch-a")).resolves.toBeDefined();
  });

  it("is unaffected for an unscoped (branchId: null) caller", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "cs-1", tenant_id: "tenant-1", branch_id: "branch-other" }] })
      .mockResolvedValueOnce({ rows: [{ id: "cs-1", tenant_id: "tenant-1", branch_id: "branch-other" }] });

    await expect(service.removeClassSubject("tenant-1", "actor-1", "cs-1", null)).resolves.toBeDefined();
  });
});

describe("ClassSubjectsService.createElectiveGroup branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: ClassSubjectsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new ClassSubjectsService(db, audit);
  });

  it("404s creating an elective group for a class outside the caller's branch", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.createElectiveGroup("tenant-1", "actor-1", "class-1", { name: "Electives" }, "branch-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates the group when the class belongs to the caller's own branch", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "class-1", tenant_id: "tenant-1", branch_id: "branch-a" }] })
      .mockResolvedValueOnce({ rows: [{ id: "group-1", tenant_id: "tenant-1", branch_id: "branch-a", class_id: "class-1" }] });

    await expect(
      service.createElectiveGroup("tenant-1", "actor-1", "class-1", { name: "Electives" }, "branch-a"),
    ).resolves.toBeDefined();
  });
});

describe("ClassSubjectsService.removeElectiveGroupMember branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: ClassSubjectsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new ClassSubjectsService(db, audit);
  });

  // subject_elective_group_members has no branch_id of its own -- the check
  // goes through the parent group's branch via a join, so a mismatched
  // branch also comes back empty from that joined lookup.
  it("404s removing a member whose elective group belongs to a different branch", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.removeElectiveGroupMember("tenant-1", "actor-1", "group-1", "cs-1", "branch-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("removes a member whose elective group belongs to the caller's own branch", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "member-1", tenant_id: "tenant-1", elective_group_id: "group-1", class_subject_id: "cs-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "member-1", tenant_id: "tenant-1" }] });

    await expect(
      service.removeElectiveGroupMember("tenant-1", "actor-1", "group-1", "cs-1", "branch-a"),
    ).resolves.toBeDefined();
  });
});

describe("ClassSubjectsService.addElectiveGroupMember", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: ClassSubjectsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new ClassSubjectsService(db, audit);
  });

  it("rejects when the group doesn't exist", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] }) // group lookup
      .mockResolvedValueOnce({ rows: [{ id: "cs-1", is_elective: true, class_id: "class-1", tenant_id: "tenant-1" }] }); // class subject lookup

    await expect(
      service.addElectiveGroupMember("tenant-1", "actor-1", "group-1", { class_subject_id: "cs-1" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a class subject that isn't marked elective", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "group-1", class_id: "class-1", branch_id: "branch-1", tenant_id: "tenant-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "cs-1", is_elective: false, class_id: "class-1", tenant_id: "tenant-1" }] });

    await expect(
      service.addElectiveGroupMember("tenant-1", "actor-1", "group-1", { class_subject_id: "cs-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a class subject from a different class than the group", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "group-1", class_id: "class-1", branch_id: "branch-1", tenant_id: "tenant-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "cs-1", is_elective: true, class_id: "class-2", tenant_id: "tenant-1" }] });

    await expect(
      service.addElectiveGroupMember("tenant-1", "actor-1", "group-1", { class_subject_id: "cs-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("adds the member when the class subject is elective and matches the group's class", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "group-1", class_id: "class-1", branch_id: "branch-1", tenant_id: "tenant-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "cs-1", is_elective: true, class_id: "class-1", tenant_id: "tenant-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "member-1", tenant_id: "tenant-1" }] });

    await expect(
      service.addElectiveGroupMember("tenant-1", "actor-1", "group-1", { class_subject_id: "cs-1" }),
    ).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("ClassSubjectsService.deleteElectiveGroup", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: ClassSubjectsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new ClassSubjectsService(db, audit);
  });

  it("rejects deleting a group that students have already chosen from", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "group-1", name: "Elective 1", branch_id: "branch-1", tenant_id: "tenant-1" }] })
      .mockResolvedValueOnce({ rows: [{ count: "3" }] });

    await expect(service.deleteElectiveGroup("tenant-1", "actor-1", "group-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("deletes the group when no student has chosen from it", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "group-1", name: "Elective 1", branch_id: "branch-1", tenant_id: "tenant-1" }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ id: "group-1", tenant_id: "tenant-1" }] });

    await expect(service.deleteElectiveGroup("tenant-1", "actor-1", "group-1")).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("404s deleting an elective group outside the caller's branch", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.deleteElectiveGroup("tenant-1", "actor-1", "group-1", "branch-a")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("deletes a group within the caller's own branch", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "group-1", name: "Elective 1", branch_id: "branch-a", tenant_id: "tenant-1" }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ id: "group-1", tenant_id: "tenant-1" }] });

    await expect(service.deleteElectiveGroup("tenant-1", "actor-1", "group-1", "branch-a")).resolves.toBeDefined();
  });

  it("is unaffected for an unscoped (branchId: null) caller", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "group-1", name: "Elective 1", branch_id: "branch-other", tenant_id: "tenant-1" }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ id: "group-1", tenant_id: "tenant-1" }] });

    await expect(service.deleteElectiveGroup("tenant-1", "actor-1", "group-1", null)).resolves.toBeDefined();
  });
});

describe("ClassSubjectsService.getApplicableSubjectsForStudent", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let audit: ReturnType<typeof makeAuditMock>;
  let service: ClassSubjectsService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    audit = makeAuditMock();
    service = new ClassSubjectsService(db, audit);
  });

  it("returns an empty list when the student has no current class", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "student-1", current_class_id: null });

    const result = await service.getApplicableSubjectsForStudent("tenant-1", "student-1", "session-1");
    expect(result).toEqual([]);
  });

  it("merges mandatory subjects with the student's elected subjects", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "student-1", current_class_id: "class-1" });
    db.query
      .mockResolvedValueOnce([
        { subject_id: "subj-math", subject_name: "Mathematics" },
        { subject_id: "subj-english", subject_name: "English" },
      ])
      .mockResolvedValueOnce([{ subject_id: "subj-art", subject_name: "Art" }]);

    const result = await service.getApplicableSubjectsForStudent("tenant-1", "student-1", "session-1");

    expect(result).toEqual([
      { subject_id: "subj-math", subject_name: "Mathematics" },
      { subject_id: "subj-english", subject_name: "English" },
      { subject_id: "subj-art", subject_name: "Art" },
    ]);
  });
});
