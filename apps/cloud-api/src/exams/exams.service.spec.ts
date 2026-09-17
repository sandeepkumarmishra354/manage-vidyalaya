import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { ClassSubjectsService } from "../class-subjects/class-subjects.service.js";
import type { ScopedAccessService } from "../common/scoped-access.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { ExamsService } from "./exams.service.js";

const BASE_EXAM = {
  id: "exam-1",
  tenantId: "tenant-1",
  name: "Term 1",
  classId: "class-1",
  academicSessionId: "session-1",
  passingPercentage: 33,
  resultsPublishedAt: null as Date | null,
};

function makePrismaMock() {
  const tx = { exam: { update: vi.fn().mockResolvedValue({}) } };
  return {
    exam: { findUnique: vi.fn(), findFirst: vi.fn() },
    teacherSubjectAssignment: { findFirst: vi.fn(), findMany: vi.fn() },
    student: { findMany: vi.fn() },
    examMark: { findMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(tx),
    ),
    __tx: tx,
  } as unknown as PrismaService & {
    exam: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    teacherSubjectAssignment: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    student: { findMany: ReturnType<typeof vi.fn> };
    examMark: { findMany: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
    __tx: typeof tx;
  };
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

describe("ExamsService marks-entry authorization", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let classSubjects: ReturnType<typeof makeClassSubjectsMock>;
  let service: ExamsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    classSubjects = makeClassSubjectsMock();
    service = new ExamsService(prisma, audit, scopedAccess, classSubjects);
    prisma.exam.findUnique.mockResolvedValue({ ...BASE_EXAM });
    prisma.student.findMany.mockResolvedValue([]);
    prisma.examMark.findMany.mockResolvedValue([]);
  });

  it("throws NotFoundException when the exam doesn't exist", async () => {
    prisma.exam.findUnique.mockResolvedValueOnce(null);

    await expect(service.getMarksRoster("tenant-1", "user-1", "missing", "subj-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("allows a broad exams.enter_marks holder without checking assignments", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

    await service.getMarksRoster("tenant-1", "user-1", "exam-1", "subj-1");

    expect(scopedAccess.getActingStaff).not.toHaveBeenCalled();
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ currentSectionId: expect.anything() }) }),
    );
  });

  it("allows an assigned teacher (any section) without the broad permission", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
    prisma.teacherSubjectAssignment.findFirst.mockResolvedValueOnce({ id: "assign-1", sectionId: null });

    await service.getMarksRoster("tenant-1", "user-1", "exam-1", "subj-1");

    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ currentSectionId: expect.anything() }) }),
    );
  });

  it("narrows the roster to the assigned section when the assignment is section-scoped", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
    prisma.teacherSubjectAssignment.findFirst.mockResolvedValueOnce({ id: "assign-1", sectionId: "section-a" });

    await service.getMarksRoster("tenant-1", "user-1", "exam-1", "subj-1");

    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ currentSectionId: "section-a" }) }),
    );
  });

  it("rejects a user with no permission and no matching assignment", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
    prisma.teacherSubjectAssignment.findFirst.mockResolvedValueOnce(null);

    await expect(service.getMarksRoster("tenant-1", "user-1", "exam-1", "subj-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe("ExamsService.saveMarks", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let classSubjects: ReturnType<typeof makeClassSubjectsMock>;
  let service: ExamsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    classSubjects = makeClassSubjectsMock();
    service = new ExamsService(prisma, audit, scopedAccess, classSubjects);
    prisma.exam.findUnique.mockResolvedValue({ ...BASE_EXAM });
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    prisma.examMark.upsert.mockResolvedValue({});
  });

  const baseDto = { exam_id: "exam-1", subject_id: "subj-1" };

  it("rejects edits once results have been published", async () => {
    prisma.exam.findUnique.mockResolvedValueOnce({ ...BASE_EXAM, resultsPublishedAt: new Date() });

    await expect(
      service.saveMarks("tenant-1", "actor-1", {
        ...baseDto,
        entries: [{ student_id: "student-1", max_marks: 100, marks_obtained: 50, is_absent: false }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.examMark.upsert).not.toHaveBeenCalled();
  });

  it("rejects a section-scoped teacher submitting marks for a student outside their section", async () => {
    (scopedAccess.hasPermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
    prisma.teacherSubjectAssignment.findFirst.mockResolvedValueOnce({ id: "assign-1", sectionId: "section-a" });
    prisma.student.findMany.mockResolvedValueOnce([{ id: "student-1", currentSectionId: "section-b" }]);

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

    expect(prisma.examMark.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ result: "fail" }) }),
    );
  });

  it("computes pass for an at-or-above-passing score", async () => {
    await service.saveMarks("tenant-1", "actor-1", {
      ...baseDto,
      entries: [{ student_id: "student-1", max_marks: 100, marks_obtained: 33, is_absent: false }],
    });

    expect(prisma.examMark.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ result: "pass" }) }),
    );
  });

  it("always fails an absent student regardless of marks_obtained", async () => {
    await service.saveMarks("tenant-1", "actor-1", {
      ...baseDto,
      entries: [{ student_id: "student-1", max_marks: 100, marks_obtained: null, is_absent: true }],
    });

    expect(prisma.examMark.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ result: "fail" }) }),
    );
  });

  it("leaves result null when no marks have been entered yet", async () => {
    await service.saveMarks("tenant-1", "actor-1", {
      ...baseDto,
      entries: [{ student_id: "student-1", max_marks: 100, marks_obtained: null, is_absent: false }],
    });

    expect(prisma.examMark.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ result: null }) }),
    );
  });

  it("lets an explicit override_result win over the computed value", async () => {
    await service.saveMarks("tenant-1", "actor-1", {
      ...baseDto,
      entries: [
        { student_id: "student-1", max_marks: 100, marks_obtained: 20, is_absent: false, override_result: "grace" },
      ],
    });

    expect(prisma.examMark.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ result: "grace" }) }),
    );
  });
});

describe("ExamsService.getMyTeachingAssignments", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let classSubjects: ReturnType<typeof makeClassSubjectsMock>;
  let service: ExamsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    classSubjects = makeClassSubjectsMock();
    service = new ExamsService(prisma, audit, scopedAccess, classSubjects);
    prisma.exam.findUnique.mockResolvedValue({ ...BASE_EXAM });
  });

  it("returns an empty list when the caller isn't linked to any staff row", async () => {
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await service.getMyTeachingAssignments("tenant-1", "user-1", "exam-1");
    expect(result).toEqual([]);
  });

  it("de-duplicates multiple section-scoped assignments for the same subject", async () => {
    (scopedAccess.getActingStaff as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "staff-1" });
    prisma.teacherSubjectAssignment.findMany.mockResolvedValueOnce([
      { subjectId: "subj-1", subject: { name: "Mathematics" } },
      { subjectId: "subj-1", subject: { name: "Mathematics" } },
      { subjectId: "subj-2", subject: { name: "English" } },
    ]);

    const result = await service.getMyTeachingAssignments("tenant-1", "user-1", "exam-1");
    expect(result).toEqual([
      { subject_id: "subj-1", subject_name: "Mathematics" },
      { subject_id: "subj-2", subject_name: "English" },
    ]);
  });
});

describe("ExamsService.getSubmissionStatus", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let classSubjects: ReturnType<typeof makeClassSubjectsMock>;
  let service: ExamsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    classSubjects = makeClassSubjectsMock();
    service = new ExamsService(prisma, audit, scopedAccess, classSubjects);
    prisma.exam.findUnique.mockResolvedValue({ ...BASE_EXAM });
    prisma.teacherSubjectAssignment.findMany.mockResolvedValue([]);
  });

  it("reports a subject complete once every applicable student has a mark", async () => {
    prisma.student.findMany.mockResolvedValueOnce([{ id: "student-1" }, { id: "student-2" }]);
    (classSubjects.getApplicableSubjectsForStudent as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ subject_id: "subj-math", subject_name: "Mathematics" }])
      .mockResolvedValueOnce([{ subject_id: "subj-math", subject_name: "Mathematics" }]);
    prisma.examMark.findMany.mockResolvedValueOnce([
      { studentId: "student-1", subjectId: "subj-math", marksObtained: 40, isAbsent: false },
      { studentId: "student-2", subjectId: "subj-math", marksObtained: 55, isAbsent: false },
    ]);

    const result = await service.getSubmissionStatus("exam-1");
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
    prisma.student.findMany.mockResolvedValueOnce([{ id: "student-1" }, { id: "student-2" }]);
    (classSubjects.getApplicableSubjectsForStudent as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ subject_id: "subj-math", subject_name: "Mathematics" }])
      .mockResolvedValueOnce([{ subject_id: "subj-math", subject_name: "Mathematics" }]);
    prisma.examMark.findMany.mockResolvedValueOnce([
      { studentId: "student-1", subjectId: "subj-math", marksObtained: 40, isAbsent: false },
    ]);

    const result = await service.getSubmissionStatus("exam-1");
    expect(result[0]).toMatchObject({ expected_count: 2, entered_count: 1, is_complete: false });
  });

  it("names the responsible teacher for each subject", async () => {
    prisma.student.findMany.mockResolvedValueOnce([{ id: "student-1" }]);
    (classSubjects.getApplicableSubjectsForStudent as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { subject_id: "subj-math", subject_name: "Mathematics" },
    ]);
    prisma.examMark.findMany.mockResolvedValueOnce([]);
    prisma.teacherSubjectAssignment.findMany.mockResolvedValueOnce([
      { subjectId: "subj-math", staff: { firstName: "Asha", lastName: "Rao" } },
    ]);

    const result = await service.getSubmissionStatus("exam-1");
    expect(result[0].teachers).toEqual(["Asha Rao"]);
  });
});

describe("ExamsService.publishExamResults", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let classSubjects: ReturnType<typeof makeClassSubjectsMock>;
  let service: ExamsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    classSubjects = makeClassSubjectsMock();
    service = new ExamsService(prisma, audit, scopedAccess, classSubjects);
    prisma.exam.findFirst.mockResolvedValue({ ...BASE_EXAM });
    prisma.teacherSubjectAssignment.findMany.mockResolvedValue([]);
  });

  it("throws NotFoundException when the exam doesn't exist", async () => {
    prisma.exam.findFirst.mockResolvedValueOnce(null);

    await expect(service.publishExamResults("tenant-1", "actor-1", "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects publishing an already-published exam", async () => {
    prisma.exam.findFirst.mockResolvedValueOnce({ ...BASE_EXAM, resultsPublishedAt: new Date() });

    await expect(service.publishExamResults("tenant-1", "actor-1", "exam-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("blocks publishing while any subject is incomplete", async () => {
    prisma.exam.findUnique.mockResolvedValue({ ...BASE_EXAM });
    prisma.student.findMany.mockResolvedValueOnce([{ id: "student-1" }]);
    (classSubjects.getApplicableSubjectsForStudent as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { subject_id: "subj-math", subject_name: "Mathematics" },
    ]);
    prisma.examMark.findMany.mockResolvedValueOnce([]);

    await expect(service.publishExamResults("tenant-1", "actor-1", "exam-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.__tx.exam.update).not.toHaveBeenCalled();
  });

  it("publishes once every applicable subject is complete", async () => {
    prisma.exam.findUnique.mockResolvedValue({ ...BASE_EXAM });
    prisma.student.findMany.mockResolvedValueOnce([{ id: "student-1" }]);
    (classSubjects.getApplicableSubjectsForStudent as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { subject_id: "subj-math", subject_name: "Mathematics" },
    ]);
    prisma.examMark.findMany.mockResolvedValueOnce([
      { studentId: "student-1", subjectId: "subj-math", marksObtained: 40, isAbsent: false },
    ]);

    await service.publishExamResults("tenant-1", "actor-1", "exam-1");

    expect(prisma.__tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resultsPublishedAt: expect.any(Date) }) }),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("ExamsService.reopenExamResults", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let scopedAccess: ReturnType<typeof makeScopedAccessMock>;
  let classSubjects: ReturnType<typeof makeClassSubjectsMock>;
  let service: ExamsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    scopedAccess = makeScopedAccessMock();
    classSubjects = makeClassSubjectsMock();
    service = new ExamsService(prisma, audit, scopedAccess, classSubjects);
  });

  it("rejects reopening an exam that isn't published", async () => {
    prisma.exam.findFirst.mockResolvedValueOnce({ ...BASE_EXAM, resultsPublishedAt: null });

    await expect(service.reopenExamResults("tenant-1", "actor-1", "exam-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("clears resultsPublishedAt for a published exam", async () => {
    prisma.exam.findFirst.mockResolvedValueOnce({ ...BASE_EXAM, resultsPublishedAt: new Date() });

    await service.reopenExamResults("tenant-1", "actor-1", "exam-1");

    expect(prisma.__tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resultsPublishedAt: null }) }),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("ExamsService.listExams", () => {
  let prisma: { exam: { findMany: ReturnType<typeof vi.fn> } };
  let service: ExamsService;

  beforeEach(() => {
    prisma = { exam: { findMany: vi.fn().mockResolvedValue([]) } };
    service = new ExamsService(
      prisma as unknown as PrismaService,
      makeAuditMock(),
      {} as ScopedAccessService,
      {} as ClassSubjectsService,
    );
  });

  it("scopes to the branch with no extra filters when none are given", async () => {
    await service.listExams("branch-1");
    expect(prisma.exam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId: "branch-1", deletedAt: null },
      }),
    );
  });

  it("combines class and session filters with AND", async () => {
    await service.listExams("branch-1", "class-1", "session-1");
    expect(prisma.exam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          branchId: "branch-1",
          deletedAt: null,
          classId: "class-1",
          academicSessionId: "session-1",
        },
      }),
    );
  });
});
