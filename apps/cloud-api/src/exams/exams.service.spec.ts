import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { ClassSubjectsService } from "../class-subjects/class-subjects.service.js";
import type { ScopedAccessService } from "../common/scoped-access.service.js";
import type { DbService } from "../db/db.service.js";
import { ExamsService } from "./exams.service.js";

const BASE_EXAM = {
  id: "exam-1",
  tenant_id: "tenant-1",
  class_id: "class-1",
  academic_session_id: "session-1",
  passing_percentage: 33,
  results_published_at: null as Date | null,
};

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

function makeScopedAccessMock() {
  return {
    hasPermission: vi.fn(),
    getActingStaff: vi.fn(),
    isClassTeacherOfSection: vi.fn(),
    isAssignedToSubject: vi.fn(),
  } as unknown as ScopedAccessService & Record<string, ReturnType<typeof vi.fn>>;
}

function makeClassSubjectsMock() {
  return { getApplicableSubjectsForStudent: vi.fn().mockResolvedValue([]) } as unknown as ClassSubjectsService &
    Record<string, ReturnType<typeof vi.fn>>;
}

// Phase 2 branch scoping: updateExam goes straight through tenant-repo's
// updateRow, which ANDs branch_id into the WHERE clause when branchId is
// passed -- a mismatched branch comes back as "not found" exactly like a
// wrong id would.
describe("ExamsService.updateExam branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let service: ExamsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new ExamsService(db, makeAuditMock(), makeScopedAccessMock(), makeClassSubjectsMock());
  });

  it("404s updating an exam outside the caller's branch", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.updateExam("tenant-1", "actor-1", "exam-1", { name: "Term 1", passing_percentage: 33 }, "branch-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("updates an exam within the caller's own branch", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "exam-1", tenant_id: "tenant-1", branch_id: "branch-a", name: "Term 1" }],
    });

    await expect(
      service.updateExam("tenant-1", "actor-1", "exam-1", { name: "Term 1", passing_percentage: 33 }, "branch-a"),
    ).resolves.toBeDefined();
  });

  it("is unaffected for an unscoped (branchId: null) caller", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "exam-1", tenant_id: "tenant-1", branch_id: "branch-other", name: "Term 1" }],
    });

    await expect(
      service.updateExam("tenant-1", "actor-1", "exam-1", { name: "Term 1", passing_percentage: 33 }, null),
    ).resolves.toBeDefined();
  });
});

// subjects.branch_id is NOT NULL in the schema (confirmed against
// migrations/1789709307097_baseline-schema.sql) -- updateSubject was
// missed by the initial Phase 2 pass, which incorrectly treated subjects
// as tenant-wide. Same updateRow-branch_id pattern as updateExam above.
describe("ExamsService.updateSubject branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let service: ExamsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new ExamsService(db, makeAuditMock(), makeScopedAccessMock(), makeClassSubjectsMock());
  });

  it("404s updating a subject outside the caller's branch", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.updateSubject("tenant-1", "actor-1", "subject-1", { name: "Maths" }, "branch-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("updates a subject within the caller's own branch", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "subject-1", tenant_id: "tenant-1", branch_id: "branch-a", name: "Maths" }],
    });

    await expect(
      service.updateSubject("tenant-1", "actor-1", "subject-1", { name: "Maths" }, "branch-a"),
    ).resolves.toBeDefined();
  });

  it("is unaffected for an unscoped (branchId: null) caller", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "subject-1", tenant_id: "tenant-1", branch_id: "branch-other", name: "Maths" }],
    });

    await expect(
      service.updateSubject("tenant-1", "actor-1", "subject-1", { name: "Maths" }, null),
    ).resolves.toBeDefined();
  });
});

// Every hand-written by-id exam lookup (marks-entry authorization,
// teaching assignments, submission status, publish/reopen, report card,
// backpaper roster) funnels through the same branch-conditioned query --
// exercised here via getMarksRoster as a representative case.
describe("ExamsService exam lookup branch scoping", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let classSubjects: ReturnType<typeof makeClassSubjectsMock>;
  let service: ExamsService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    scopedAccess = makeScopedAccessMock();
    classSubjects = makeClassSubjectsMock();
    service = new ExamsService(db, makeAuditMock(), scopedAccess, classSubjects);
  });

  it("404s when the exam doesn't come back for the caller's branch", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    db.queryOne.mockResolvedValueOnce(null); // real Postgres excludes it via branch_id = $N

    await expect(
      service.getMarksRoster("tenant-1", "user-1", "exam-1", "subj-1", "branch-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("finds the exam when it belongs to the caller's own branch", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    db.queryOne.mockResolvedValueOnce({ ...BASE_EXAM });

    await expect(
      service.getMarksRoster("tenant-1", "user-1", "exam-1", "subj-1", "branch-a"),
    ).resolves.toBeDefined();
  });

  it("is unaffected for an unscoped (branchId: null) caller", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    db.queryOne.mockResolvedValueOnce({ ...BASE_EXAM });

    await expect(
      service.getMarksRoster("tenant-1", "user-1", "exam-1", "subj-1", null),
    ).resolves.toBeDefined();
  });
});

describe("ExamsService marks-entry authorization", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let classSubjects: ReturnType<typeof makeClassSubjectsMock>;
  let service: ExamsService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    classSubjects = makeClassSubjectsMock();
    service = new ExamsService(db, audit, scopedAccess, classSubjects);
    db.queryOne.mockImplementation(async (_t: string, sql: string) => {
      if (sql.includes("FROM exams")) return { ...BASE_EXAM };
      if (sql.includes("FROM teacher_subject_assignments")) return null;
      return null;
    });
    db.query.mockResolvedValue([]);
  });

  it("throws NotFoundException when the exam doesn't exist", async () => {
    db.queryOne.mockImplementationOnce(async () => null);

    await expect(service.getMarksRoster("tenant-1", "user-1", "missing", "subj-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("allows a broad exams.enter_marks holder without checking assignments", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

    await service.getMarksRoster("tenant-1", "user-1", "exam-1", "subj-1");

    expect(scopedAccess.getActingStaff).not.toHaveBeenCalled();
    const [, sql] = db.query.mock.calls[0];
    expect(sql).not.toContain("current_section_id");
  });

  it("allows an assigned teacher (any section) without the broad permission", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
    db.queryOne.mockImplementationOnce(async () => ({ ...BASE_EXAM })); // exam lookup
    db.queryOne.mockImplementationOnce(async () => ({ section_id: null })); // assignment lookup

    await service.getMarksRoster("tenant-1", "user-1", "exam-1", "subj-1");

    const [, sql] = db.query.mock.calls[0];
    expect(sql).not.toContain("current_section_id");
  });

  it("narrows the roster to the assigned section when the assignment is section-scoped", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
    db.queryOne.mockImplementationOnce(async () => ({ ...BASE_EXAM }));
    db.queryOne.mockImplementationOnce(async () => ({ section_id: "section-a" }));

    await service.getMarksRoster("tenant-1", "user-1", "exam-1", "subj-1");

    const [, sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("current_section_id");
    expect(params).toContain("section-a");
  });

  it("rejects a user with no permission and no matching assignment", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
    db.queryOne.mockImplementationOnce(async () => ({ ...BASE_EXAM }));
    db.queryOne.mockImplementationOnce(async () => null);

    await expect(service.getMarksRoster("tenant-1", "user-1", "exam-1", "subj-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe("ExamsService.saveMarks", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let classSubjects: ReturnType<typeof makeClassSubjectsMock>;
  let service: ExamsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    classSubjects = makeClassSubjectsMock();
    service = new ExamsService(db, audit, scopedAccess, classSubjects);
    db.queryOne.mockResolvedValue({ ...BASE_EXAM });
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    client.query.mockResolvedValue({ rows: [] });
  });

  const baseDto = { exam_id: "exam-1", subject_id: "subj-1" };

  it("rejects edits once results have been published", async () => {
    db.queryOne.mockResolvedValueOnce({ ...BASE_EXAM, results_published_at: new Date() });

    await expect(
      service.saveMarks("tenant-1", "actor-1", {
        ...baseDto,
        entries: [{ student_id: "student-1", max_marks: 100, marks_obtained: 50, is_absent: false }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejects a section-scoped teacher submitting marks for a student outside their section", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
    db.queryOne.mockReset();
    db.queryOne.mockResolvedValueOnce({ ...BASE_EXAM }); // exam lookup
    db.queryOne.mockResolvedValueOnce({ section_id: "section-a" }); // assignment lookup
    db.query.mockResolvedValueOnce([{ id: "student-1", current_section_id: "section-b" }]);

    await expect(
      service.saveMarks("tenant-1", "actor-1", {
        ...baseDto,
        entries: [{ student_id: "student-1", max_marks: 100, marks_obtained: 50, is_absent: false }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("computes fail for a below-passing score", async () => {
    await service.saveMarks("tenant-1", "actor-1", {
      ...baseDto,
      entries: [{ student_id: "student-1", max_marks: 100, marks_obtained: 20, is_absent: false }],
    });

    const [, params] = client.query.mock.calls[0];
    expect(params).toContain("fail");
  });

  it("computes pass for an at-or-above-passing score", async () => {
    await service.saveMarks("tenant-1", "actor-1", {
      ...baseDto,
      entries: [{ student_id: "student-1", max_marks: 100, marks_obtained: 33, is_absent: false }],
    });

    const [, params] = client.query.mock.calls[0];
    expect(params).toContain("pass");
  });

  it("always fails an absent student regardless of marks_obtained", async () => {
    await service.saveMarks("tenant-1", "actor-1", {
      ...baseDto,
      entries: [{ student_id: "student-1", max_marks: 100, marks_obtained: null, is_absent: true }],
    });

    const [, params] = client.query.mock.calls[0];
    expect(params).toContain("fail");
  });

  it("leaves result null when no marks have been entered yet", async () => {
    await service.saveMarks("tenant-1", "actor-1", {
      ...baseDto,
      entries: [{ student_id: "student-1", max_marks: 100, marks_obtained: null, is_absent: false }],
    });

    const [, params] = client.query.mock.calls[0];
    expect(params).toContain(null);
  });

  it("lets an explicit override_result win over the computed value", async () => {
    await service.saveMarks("tenant-1", "actor-1", {
      ...baseDto,
      entries: [
        { student_id: "student-1", max_marks: 100, marks_obtained: 20, is_absent: false, override_result: "grace" },
      ],
    });

    const [, params] = client.query.mock.calls[0];
    expect(params).toContain("grace");
  });
});

describe("ExamsService.getMyTeachingAssignments", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let classSubjects: ReturnType<typeof makeClassSubjectsMock>;
  let service: ExamsService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    classSubjects = makeClassSubjectsMock();
    service = new ExamsService(db, audit, scopedAccess, classSubjects);
    db.queryOne.mockResolvedValue({ ...BASE_EXAM });
  });

  it("returns an empty list when the caller isn't linked to any staff row", async () => {
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await service.getMyTeachingAssignments("tenant-1", "user-1", "exam-1");
    expect(result).toEqual([]);
  });

  it("de-duplicates multiple section-scoped assignments for the same subject", async () => {
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
    db.query.mockResolvedValueOnce([
      { subject_id: "subj-1", subject_name: "Mathematics" },
      { subject_id: "subj-1", subject_name: "Mathematics" },
      { subject_id: "subj-2", subject_name: "English" },
    ]);

    const result = await service.getMyTeachingAssignments("tenant-1", "user-1", "exam-1");
    expect(result).toEqual([
      { subject_id: "subj-1", subject_name: "Mathematics" },
      { subject_id: "subj-2", subject_name: "English" },
    ]);
  });
});

describe("ExamsService.getSubmissionStatus", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let classSubjects: ReturnType<typeof makeClassSubjectsMock>;
  let service: ExamsService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    classSubjects = makeClassSubjectsMock();
    service = new ExamsService(db, audit, scopedAccess, classSubjects);
    db.queryOne.mockResolvedValue({ ...BASE_EXAM });
    db.query.mockResolvedValue([]);
  });

  it("reports a subject complete once every applicable student has a mark", async () => {
    db.query
      .mockResolvedValueOnce([{ id: "student-1" }, { id: "student-2" }]) // students
      .mockResolvedValueOnce([
        { student_id: "student-1", subject_id: "subj-math", marks_obtained: 40, is_absent: false },
        { student_id: "student-2", subject_id: "subj-math", marks_obtained: 55, is_absent: false },
      ]) // marks
      .mockResolvedValueOnce([]); // teacher assignments
    (classSubjects.getApplicableSubjectsForStudent as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ subject_id: "subj-math", subject_name: "Mathematics" }])
      .mockResolvedValueOnce([{ subject_id: "subj-math", subject_name: "Mathematics" }]);

    const result = await service.getSubmissionStatus("tenant-1", "exam-1");
    expect(result).toEqual([
      {
        subject_id: "subj-math",
        subject_name: "Mathematics",
        expected_count: 2,
        entered_count: 2,
        is_complete: true,
        teachers: [],
      },
    ]);
  });

  it("reports a subject incomplete when a student's mark is still missing", async () => {
    db.query
      .mockResolvedValueOnce([{ id: "student-1" }, { id: "student-2" }])
      .mockResolvedValueOnce([{ student_id: "student-1", subject_id: "subj-math", marks_obtained: 40, is_absent: false }])
      .mockResolvedValueOnce([]);
    (classSubjects.getApplicableSubjectsForStudent as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ subject_id: "subj-math", subject_name: "Mathematics" }])
      .mockResolvedValueOnce([{ subject_id: "subj-math", subject_name: "Mathematics" }]);

    const result = await service.getSubmissionStatus("tenant-1", "exam-1");
    expect(result[0]).toMatchObject({ expected_count: 2, entered_count: 1, is_complete: false });
  });

  it("names the responsible teacher for each subject", async () => {
    db.query
      .mockResolvedValueOnce([{ id: "student-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ subject_id: "subj-math", first_name: "Asha", last_name: "Rao" }]);
    (classSubjects.getApplicableSubjectsForStudent as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { subject_id: "subj-math", subject_name: "Mathematics" },
    ]);

    const result = await service.getSubmissionStatus("tenant-1", "exam-1");
    expect(result[0].teachers).toEqual(["Asha Rao"]);
  });
});

describe("ExamsService.publishExamResults", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let classSubjects: ReturnType<typeof makeClassSubjectsMock>;
  let service: ExamsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    classSubjects = makeClassSubjectsMock();
    service = new ExamsService(db, audit, scopedAccess, classSubjects);
    db.queryOne.mockResolvedValue({ ...BASE_EXAM, name: "Term 1" });
    db.query.mockResolvedValue([]);
    client.query.mockResolvedValue({ rows: [{ id: "exam-1", tenant_id: "tenant-1" }] });
  });

  it("throws NotFoundException when the exam doesn't exist", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    await expect(service.publishExamResults("tenant-1", "actor-1", "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects publishing an already-published exam", async () => {
    db.queryOne.mockResolvedValueOnce({ ...BASE_EXAM, results_published_at: new Date() });

    await expect(service.publishExamResults("tenant-1", "actor-1", "exam-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("blocks publishing while any subject is incomplete", async () => {
    db.queryOne.mockResolvedValueOnce({ ...BASE_EXAM, name: "Term 1" });
    db.query.mockResolvedValueOnce([{ id: "student-1" }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    (classSubjects.getApplicableSubjectsForStudent as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { subject_id: "subj-math", subject_name: "Mathematics" },
    ]);

    await expect(service.publishExamResults("tenant-1", "actor-1", "exam-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  it("publishes once every applicable subject is complete", async () => {
    db.queryOne.mockResolvedValueOnce({ ...BASE_EXAM, name: "Term 1" });
    db.query
      .mockResolvedValueOnce([{ id: "student-1" }])
      .mockResolvedValueOnce([{ student_id: "student-1", subject_id: "subj-math", marks_obtained: 40, is_absent: false }])
      .mockResolvedValueOnce([]);
    (classSubjects.getApplicableSubjectsForStudent as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { subject_id: "subj-math", subject_name: "Mathematics" },
    ]);

    await service.publishExamResults("tenant-1", "actor-1", "exam-1");

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("UPDATE exams");
    expect(params.some((p: unknown) => p instanceof Date)).toBe(true);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("ExamsService.reopenExamResults", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let classSubjects: ReturnType<typeof makeClassSubjectsMock>;
  let service: ExamsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    classSubjects = makeClassSubjectsMock();
    service = new ExamsService(db, audit, scopedAccess, classSubjects);
    client.query.mockResolvedValue({ rows: [{ id: "exam-1", tenant_id: "tenant-1" }] });
  });

  it("rejects reopening an exam that isn't published", async () => {
    db.queryOne.mockResolvedValueOnce({ ...BASE_EXAM, name: "Term 1", results_published_at: null });

    await expect(service.reopenExamResults("tenant-1", "actor-1", "exam-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("clears results_published_at for a published exam", async () => {
    db.queryOne.mockResolvedValueOnce({ ...BASE_EXAM, name: "Term 1", results_published_at: new Date() });

    await service.reopenExamResults("tenant-1", "actor-1", "exam-1");

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("UPDATE exams");
    expect(params).toContain(null);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("ExamsService.listExams", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let service: ExamsService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    service = new ExamsService(db, makeAuditMock(), {} as ScopedAccessService, {} as ClassSubjectsService);
  });

  it("scopes to the tenant and branch with no extra filters when none are given", async () => {
    await service.listExams("tenant-1", "branch-1");
    const [tenantId, sql, params] = db.query.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
    expect(sql).toContain("tenant_id = $1");
    expect(sql).toContain("branch_id = $2");
    expect(params).toEqual(["tenant-1", "branch-1"]);
  });

  it("combines class and session filters with AND", async () => {
    await service.listExams("tenant-1", "branch-1", "class-1", "session-1");
    const [, sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("class_id = $3");
    expect(sql).toContain("academic_session_id = $4");
    expect(params).toEqual(["tenant-1", "branch-1", "class-1", "session-1"]);
  });
});
