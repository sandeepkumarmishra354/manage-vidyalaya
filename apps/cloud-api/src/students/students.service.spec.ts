import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { StudentsService } from "./students.service.js";

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`admission_number`)", {
    code: "P2002",
    clientVersion: "6.19.3",
  });
}

function makePrismaMock() {
  return {
    admission: { findFirst: vi.fn(), update: vi.fn() },
    branch: { findUniqueOrThrow: vi.fn() },
    student: { count: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    subjectElectiveGroup: { findFirst: vi.fn() },
    subjectElectiveGroupMember: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        admission: { update: vi.fn() },
        studentElectiveChoice: { upsert: vi.fn().mockResolvedValue({ id: "choice-1" }) },
      }),
    ),
  } as unknown as PrismaService;
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("StudentsService.confirmAdmission", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StudentsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new StudentsService(prisma, audit);

    (prisma.admission.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "admission-1",
      studentId: "student-1",
      branchId: "branch-1",
      deletedAt: null,
    });
    (prisma.branch.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "branch-1", code: "MAIN" });
  });

  it("throws NotFoundException when the admission doesn't exist", async () => {
    (prisma.admission.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(service.confirmAdmission("tenant-a", "actor-1", "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("assigns branch+year-scoped sequential number 0001 when no prior students exist", async () => {
    (prisma.student.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (prisma.student.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const result = await service.confirmAdmission("tenant-a", "actor-1", "admission-1");

    const year = new Date().getUTCFullYear();
    expect(result.admission_number).toBe(`MAIN-${year}-0001`);
    expect(result.stage).toBe("enrolled");
  });

  it("continues the sequence from the existing count", async () => {
    (prisma.student.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(41);
    (prisma.student.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const result = await service.confirmAdmission("tenant-a", "actor-1", "admission-1");

    const year = new Date().getUTCFullYear();
    expect(result.admission_number).toBe(`MAIN-${year}-0042`);
  });

  it("retries with the next sequence number on a unique-constraint clash (same-request race)", async () => {
    (prisma.student.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (prisma.student.update as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(uniqueConstraintError())
      .mockRejectedValueOnce(uniqueConstraintError())
      .mockResolvedValueOnce({});

    const result = await service.confirmAdmission("tenant-a", "actor-1", "admission-1");

    const year = new Date().getUTCFullYear();
    expect(result.admission_number).toBe(`MAIN-${year}-0003`);
    expect(prisma.student.update).toHaveBeenCalledTimes(3);
  });

  it("propagates a non-unique-constraint error immediately without retrying", async () => {
    (prisma.student.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    const otherError = new Error("connection lost");
    (prisma.student.update as ReturnType<typeof vi.fn>).mockRejectedValueOnce(otherError);

    await expect(service.confirmAdmission("tenant-a", "actor-1", "admission-1")).rejects.toBe(otherError);
    expect(prisma.student.update).toHaveBeenCalledTimes(1);
  });
});

describe("StudentsService.electSubject", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StudentsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new StudentsService(prisma, audit);
    (prisma.student.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "student-1",
      branchId: "branch-1",
      currentClassId: "class-1",
    });
  });

  const dto = { elective_group_id: "group-1", subject_id: "subj-art", academic_session_id: "session-1" };

  it("throws NotFoundException when the student doesn't exist", async () => {
    (prisma.student.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(service.electSubject("tenant-a", "actor-1", "missing", dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects when the elective group belongs to a different class than the student's current class", async () => {
    (prisma.subjectElectiveGroup.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "group-1",
      classId: "class-2",
    });

    await expect(service.electSubject("tenant-a", "actor-1", "student-1", dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("rejects when the chosen subject isn't a member of the elective group", async () => {
    (prisma.subjectElectiveGroup.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "group-1",
      classId: "class-1",
    });
    (prisma.subjectElectiveGroupMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(service.electSubject("tenant-a", "actor-1", "student-1", dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("records the choice when the subject is a valid member of the group", async () => {
    (prisma.subjectElectiveGroup.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "group-1",
      classId: "class-1",
    });
    (prisma.subjectElectiveGroupMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "member-1" });

    const result = await service.electSubject("tenant-a", "actor-1", "student-1", dto);
    expect(result).toEqual({ id: "choice-1" });
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("StudentsService.getGuardian", () => {
  let prisma: { guardian: { findFirst: ReturnType<typeof vi.fn> }; studentGuardian: { findMany: ReturnType<typeof vi.fn> } };
  let service: StudentsService;

  beforeEach(() => {
    prisma = { guardian: { findFirst: vi.fn() }, studentGuardian: { findMany: vi.fn() } };
    service = new StudentsService(prisma as unknown as PrismaService, makeAuditMock());
  });

  it("throws when the guardian doesn't exist or is soft-deleted", async () => {
    prisma.guardian.findFirst.mockResolvedValueOnce(null);
    await expect(service.getGuardian("tenant-a", "guardian-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns the guardian's profile plus every linked child, regardless of enrollment status", async () => {
    prisma.guardian.findFirst.mockResolvedValueOnce({
      id: "guardian-1",
      fullName: "Asha Rao",
      relation: "mother",
      phone: "9876500000",
      altPhone: null,
      email: null,
      occupation: "Engineer",
      address: null,
      aadhaarNumber: null,
      annualIncome: null,
    });
    prisma.studentGuardian.findMany.mockResolvedValueOnce([
      {
        student: {
          id: "student-1",
          firstName: "Ravi",
          lastName: "Rao",
          admissionNumber: "ADM-0001",
          status: "enrolled",
          currentClass: { name: "Class 5" },
          currentSection: { name: "A" },
        },
      },
      {
        student: {
          id: "student-2",
          firstName: "Priya",
          lastName: "Rao",
          admissionNumber: null,
          status: "applied",
          currentClass: null,
          currentSection: null,
        },
      },
    ]);

    const result = await service.getGuardian("tenant-a", "guardian-1");

    expect(result.full_name).toBe("Asha Rao");
    expect(result.children).toEqual([
      {
        id: "student-1",
        first_name: "Ravi",
        last_name: "Rao",
        admission_number: "ADM-0001",
        class_name: "Class 5",
        section_name: "A",
        status: "enrolled",
      },
      {
        id: "student-2",
        first_name: "Priya",
        last_name: "Rao",
        admission_number: null,
        class_name: null,
        section_name: null,
        status: "applied",
      },
    ]);
    expect(prisma.studentGuardian.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guardianId: "guardian-1", student: { deletedAt: null } } }),
    );
  });
});
