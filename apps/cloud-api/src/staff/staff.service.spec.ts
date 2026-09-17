import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { StaffService } from "./staff.service.js";

function makePrismaMock() {
  const tx = {
    section: { findFirst: vi.fn(), update: vi.fn() },
    staff: { updateMany: vi.fn(), update: vi.fn() },
  };
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
  } as unknown as PrismaService & { __tx: typeof tx };
}

const baseUpdateStaffDto = {
  branch_id: "branch-1",
  employee_code: "EMP-0001",
  first_name: "Asha",
  designation: "Teacher",
  employment_type: "full_time",
  date_of_joining: "2020-01-01",
};

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("StaffService.setClassTeacher", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StaffService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new StaffService(prisma, audit);
  });

  it("rejects assigning a staff member who is already class teacher of a different section", async () => {
    prisma.__tx.section.findFirst.mockResolvedValueOnce({
      id: "section-other",
      class: { name: "Class 8" },
      name: "B",
    });

    await expect(
      service.setClassTeacher("tenant-1", "actor-1", "section-a", { staff_id: "staff-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.__tx.section.update).not.toHaveBeenCalled();
  });

  it("allows assigning a staff member with no conflicting section", async () => {
    prisma.__tx.section.findFirst.mockResolvedValueOnce(null);
    prisma.__tx.section.update.mockResolvedValueOnce({ id: "section-a", classTeacherStaffId: "staff-1" });

    const result = await service.setClassTeacher("tenant-1", "actor-1", "section-a", { staff_id: "staff-1" });

    expect(result).toEqual({ id: "section-a", classTeacherStaffId: "staff-1" });
    expect(audit.record).toHaveBeenCalled();
  });

  it("does not conflict-check when clearing the class teacher (staff_id null)", async () => {
    prisma.__tx.section.update.mockResolvedValueOnce({ id: "section-a", classTeacherStaffId: null });

    await service.setClassTeacher("tenant-1", "actor-1", "section-a", { staff_id: null });

    expect(prisma.__tx.section.findFirst).not.toHaveBeenCalled();
  });

  it("excludes the section being updated from the conflict check", async () => {
    prisma.__tx.section.findFirst.mockResolvedValueOnce(null);
    prisma.__tx.section.update.mockResolvedValueOnce({ id: "section-a", classTeacherStaffId: "staff-1" });

    await service.setClassTeacher("tenant-1", "actor-1", "section-a", { staff_id: "staff-1" });

    expect(prisma.__tx.section.findFirst).toHaveBeenCalledWith({
      where: { classTeacherStaffId: "staff-1", deletedAt: null, id: { not: "section-a" } },
      include: { class: true },
    });
  });
});

describe("StaffService.updateStaff", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StaffService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new StaffService(prisma, audit);
    prisma.__tx.staff.update.mockResolvedValue({ id: "staff-1" });
  });

  it("clears any other principal in the same branch when is_principal is set", async () => {
    await service.updateStaff("tenant-1", "actor-1", "staff-1", { ...baseUpdateStaffDto, is_principal: true });

    expect(prisma.__tx.staff.updateMany).toHaveBeenCalledWith({
      where: { branchId: "branch-1", isPrincipal: true, id: { not: "staff-1" }, deletedAt: null },
      data: expect.objectContaining({ isPrincipal: false }),
    });
  });

  it("does not touch other staff's principal flag when is_principal is omitted", async () => {
    await service.updateStaff("tenant-1", "actor-1", "staff-1", baseUpdateStaffDto);

    expect(prisma.__tx.staff.updateMany).not.toHaveBeenCalled();
    expect(prisma.__tx.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPrincipal: false, signatureUrl: null }) }),
    );
  });

  it("writes the provided signature_url", async () => {
    await service.updateStaff("tenant-1", "actor-1", "staff-1", {
      ...baseUpdateStaffDto,
      signature_url: "data:image/png;base64,abc",
    });

    expect(prisma.__tx.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ signatureUrl: "data:image/png;base64,abc" }) }),
    );
  });
});

function makeCreatePrismaMock() {
  const tx = { staff: { create: vi.fn() } };
  return {
    branch: { findUniqueOrThrow: vi.fn() },
    staff: { count: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
  } as unknown as PrismaService & { branch: { findUniqueOrThrow: ReturnType<typeof vi.fn> }; staff: { count: ReturnType<typeof vi.fn> }; __tx: typeof tx };
}

const baseCreateStaffDto = {
  branch_id: "branch-1",
  first_name: "Asha",
  designation: "Teacher",
  employment_type: "full_time",
  date_of_joining: "2020-01-01",
};

describe("StaffService.createStaff", () => {
  let prisma: ReturnType<typeof makeCreatePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StaffService;

  beforeEach(() => {
    prisma = makeCreatePrismaMock();
    audit = makeAuditMock();
    service = new StaffService(prisma, audit);
    prisma.__tx.staff.create.mockResolvedValue({ id: "staff-1", employeeCode: "MAIN-0001" });
  });

  it("uses the supplied employee_code as-is without touching branch/count", async () => {
    await service.createStaff("tenant-1", "actor-1", { ...baseCreateStaffDto, employee_code: "CUSTOM-1" });

    expect(prisma.branch.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.__tx.staff.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ employeeCode: "CUSTOM-1" }) }),
    );
  });

  it("auto-generates {branch code}-{count+1} when employee_code is blank", async () => {
    prisma.branch.findUniqueOrThrow.mockResolvedValueOnce({ id: "branch-1", code: "MAIN" });
    prisma.staff.count.mockResolvedValueOnce(7);

    await service.createStaff("tenant-1", "actor-1", baseCreateStaffDto);

    expect(prisma.__tx.staff.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ employeeCode: "MAIN-0008" }) }),
    );
  });

  it("retries with the next sequence number on a unique-constraint clash", async () => {
    prisma.branch.findUniqueOrThrow.mockResolvedValueOnce({ id: "branch-1", code: "MAIN" });
    prisma.staff.count.mockResolvedValueOnce(7);
    const { Prisma } = await import("@prisma/client");
    const clash = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "6.19.3",
    });
    prisma.__tx.staff.create
      .mockRejectedValueOnce(clash)
      .mockResolvedValueOnce({ id: "staff-1", employeeCode: "MAIN-0009" });

    const result = await service.createStaff("tenant-1", "actor-1", baseCreateStaffDto);

    expect(result).toEqual({ id: "staff-1", employeeCode: "MAIN-0009" });
    expect(prisma.__tx.staff.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ employeeCode: "MAIN-0008" }) }),
    );
    expect(prisma.__tx.staff.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ employeeCode: "MAIN-0009" }) }),
    );
  });
});

describe("StaffService.issueExperienceLetter", () => {
  let prisma: {
    staff: { findFirst: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
    __tx: { staff: { update: ReturnType<typeof vi.fn> } };
  };
  let service: StaffService;

  beforeEach(() => {
    const tx = { staff: { update: vi.fn() } };
    prisma = {
      staff: { findFirst: vi.fn() },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
      __tx: tx,
    };
    service = new StaffService(prisma as unknown as PrismaService, makeAuditMock());
  });

  it("404s for a staff member outside the tenant", async () => {
    prisma.staff.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.issueExperienceLetter("tenant-a", "user-1", "staff-1", {
        reason_for_leaving: "Resigned",
        date_of_leaving: "2026-04-01",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("generates a letter number and sets status to relieved on first issue", async () => {
    prisma.staff.findFirst.mockResolvedValueOnce({
      id: "staff-1",
      branchId: "branch-1",
      experienceLetterNumber: null,
      experienceLetterIssueDate: null,
    });
    prisma.__tx.staff.update.mockResolvedValueOnce({ id: "staff-1" });

    await service.issueExperienceLetter("tenant-a", "user-1", "staff-1", {
      reason_for_leaving: "Resigned",
      date_of_leaving: "2026-04-01",
    });

    expect(prisma.__tx.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "relieved",
          experienceLetterNumber: expect.stringMatching(/^EXP-BRAN-\d{8}-[0-9A-F]{4}$/),
        }),
      }),
    );
  });

  it("does not regenerate the letter number on a second issue", async () => {
    prisma.staff.findFirst.mockResolvedValueOnce({
      id: "staff-1",
      branchId: "branch-1",
      experienceLetterNumber: "EXP-BRAN-20260101-AAAA",
      experienceLetterIssueDate: new Date("2026-01-01"),
    });
    prisma.__tx.staff.update.mockResolvedValueOnce({ id: "staff-1" });

    await service.issueExperienceLetter("tenant-a", "user-1", "staff-1", {
      reason_for_leaving: "Resigned again",
      date_of_leaving: "2026-05-01",
    });

    expect(prisma.__tx.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          experienceLetterNumber: "EXP-BRAN-20260101-AAAA",
          experienceLetterIssueDate: new Date("2026-01-01"),
        }),
      }),
    );
  });
});

describe("StaffService.listStaff", () => {
  let prisma: { staff: { findMany: ReturnType<typeof vi.fn> } };
  let service: StaffService;

  beforeEach(() => {
    prisma = { staff: { findMany: vi.fn().mockResolvedValue([]) } };
    service = new StaffService(prisma as unknown as PrismaService, makeAuditMock());
  });

  it("scopes to the branch with no extra filters when none are given", async () => {
    await service.listStaff("branch-1");
    expect(prisma.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId: "branch-1", deletedAt: null },
      }),
    );
  });

  it("combines category/department/status filters with AND", async () => {
    await service.listStaff("branch-1", undefined, {
      categoryId: "cat-1",
      department: "Science",
      status: "active",
    });
    expect(prisma.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          branchId: "branch-1",
          deletedAt: null,
          categoryId: "cat-1",
          department: "Science",
          status: "active",
        },
      }),
    );
  });

  it("leaves existing search behavior unchanged when no filter is set", async () => {
    await service.listStaff("branch-1", "asha");
    expect(prisma.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { firstName: { contains: "asha", mode: "insensitive" } },
            { lastName: { contains: "asha", mode: "insensitive" } },
            { employeeCode: { contains: "asha", mode: "insensitive" } },
            { designation: { contains: "asha", mode: "insensitive" } },
          ],
        }),
      }),
    );
  });
});
