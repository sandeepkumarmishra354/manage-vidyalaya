import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { ClassSubjectsService } from "./class-subjects.service.js";

function makePrismaMock() {
  return {
    class: { findFirst: vi.fn() },
    classSubject: { findFirst: vi.fn(), findMany: vi.fn() },
    subjectElectiveGroup: { findFirst: vi.fn() },
    subjectElectiveGroupMember: { findFirst: vi.fn() },
    studentElectiveChoice: { count: vi.fn(), findMany: vi.fn() },
    student: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        classSubject: { update: vi.fn().mockResolvedValue({}) },
        subjectElectiveGroup: { update: vi.fn().mockResolvedValue({}) },
        subjectElectiveGroupMember: { create: vi.fn().mockResolvedValue({ id: "member-1" }), update: vi.fn().mockResolvedValue({}) },
      }),
    ),
  } as unknown as PrismaService;
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("ClassSubjectsService.addElectiveGroupMember", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: ClassSubjectsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new ClassSubjectsService(prisma, audit);
  });

  it("rejects when the group doesn't exist", async () => {
    (prisma.subjectElectiveGroup.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    (prisma.classSubject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ isElective: true, classId: "class-1" });

    await expect(
      service.addElectiveGroupMember("tenant-1", "actor-1", "group-1", { class_subject_id: "cs-1" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a class subject that isn't marked elective", async () => {
    (prisma.subjectElectiveGroup.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "group-1",
      classId: "class-1",
      branchId: "branch-1",
    });
    (prisma.classSubject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "cs-1",
      isElective: false,
      classId: "class-1",
    });

    await expect(
      service.addElectiveGroupMember("tenant-1", "actor-1", "group-1", { class_subject_id: "cs-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a class subject from a different class than the group", async () => {
    (prisma.subjectElectiveGroup.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "group-1",
      classId: "class-1",
      branchId: "branch-1",
    });
    (prisma.classSubject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "cs-1",
      isElective: true,
      classId: "class-2",
    });

    await expect(
      service.addElectiveGroupMember("tenant-1", "actor-1", "group-1", { class_subject_id: "cs-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("adds the member when the class subject is elective and matches the group's class", async () => {
    (prisma.subjectElectiveGroup.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "group-1",
      classId: "class-1",
      branchId: "branch-1",
    });
    (prisma.classSubject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "cs-1",
      isElective: true,
      classId: "class-1",
    });

    await expect(
      service.addElectiveGroupMember("tenant-1", "actor-1", "group-1", { class_subject_id: "cs-1" }),
    ).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("ClassSubjectsService.deleteElectiveGroup", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: ClassSubjectsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new ClassSubjectsService(prisma, audit);
    (prisma.subjectElectiveGroup.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "group-1",
      name: "Elective 1",
      branchId: "branch-1",
    });
  });

  it("rejects deleting a group that students have already chosen from", async () => {
    (prisma.studentElectiveChoice.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(3);

    await expect(service.deleteElectiveGroup("tenant-1", "actor-1", "group-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("deletes the group when no student has chosen from it", async () => {
    (prisma.studentElectiveChoice.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

    await expect(service.deleteElectiveGroup("tenant-1", "actor-1", "group-1")).resolves.toBeDefined();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("ClassSubjectsService.getApplicableSubjectsForStudent", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: ClassSubjectsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new ClassSubjectsService(prisma, audit);
  });

  it("returns an empty list when the student has no current class", async () => {
    (prisma.student.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "student-1",
      currentClassId: null,
    });

    const result = await service.getApplicableSubjectsForStudent("tenant-1", "student-1", "session-1");
    expect(result).toEqual([]);
  });

  it("merges mandatory subjects with the student's elected subjects", async () => {
    (prisma.student.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "student-1",
      currentClassId: "class-1",
    });
    (prisma.classSubject.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { subjectId: "subj-math", subject: { name: "Mathematics" } },
      { subjectId: "subj-english", subject: { name: "English" } },
    ]);
    (prisma.studentElectiveChoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { subjectId: "subj-art", subject: { name: "Art" } },
    ]);

    const result = await service.getApplicableSubjectsForStudent("tenant-1", "student-1", "session-1");

    expect(result).toEqual([
      { subject_id: "subj-math", subject_name: "Mathematics" },
      { subject_id: "subj-english", subject_name: "English" },
      { subject_id: "subj-art", subject_name: "Art" },
    ]);
  });
});
