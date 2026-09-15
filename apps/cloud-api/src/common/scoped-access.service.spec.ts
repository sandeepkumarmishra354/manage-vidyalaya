import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../prisma/prisma.service.js";
import { ScopedAccessService } from "./scoped-access.service.js";

describe("ScopedAccessService", () => {
  let prisma: {
    userRole: { findMany: ReturnType<typeof vi.fn> };
    rolePermission: { findFirst: ReturnType<typeof vi.fn> };
    staff: { findFirst: ReturnType<typeof vi.fn> };
    section: { findFirst: ReturnType<typeof vi.fn> };
    teacherSubjectAssignment: { findFirst: ReturnType<typeof vi.fn> };
  };
  let service: ScopedAccessService;

  beforeEach(() => {
    prisma = {
      userRole: { findMany: vi.fn() },
      rolePermission: { findFirst: vi.fn() },
      staff: { findFirst: vi.fn() },
      section: { findFirst: vi.fn() },
      teacherSubjectAssignment: { findFirst: vi.fn() },
    };
    service = new ScopedAccessService(prisma as unknown as PrismaService);
  });

  describe("hasPermission", () => {
    it("returns false for a user with no roles", async () => {
      prisma.userRole.findMany.mockResolvedValueOnce([]);
      await expect(service.hasPermission("user-1", "users.manage")).resolves.toBe(false);
      expect(prisma.rolePermission.findFirst).not.toHaveBeenCalled();
    });

    it("returns false when no role grants the permission", async () => {
      prisma.userRole.findMany.mockResolvedValueOnce([{ roleId: "role-teacher" }]);
      prisma.rolePermission.findFirst.mockResolvedValueOnce(null);
      await expect(service.hasPermission("user-1", "users.manage")).resolves.toBe(false);
    });

    it("returns true when a role grants the permission", async () => {
      prisma.userRole.findMany.mockResolvedValueOnce([{ roleId: "role-admin" }]);
      prisma.rolePermission.findFirst.mockResolvedValueOnce({ id: "grant-1" });
      await expect(service.hasPermission("user-1", "users.manage")).resolves.toBe(true);
    });

    it("queries fresh from the database rather than trusting a stale JWT roles claim", async () => {
      prisma.userRole.findMany.mockResolvedValueOnce([{ roleId: "role-admin" }]);
      prisma.rolePermission.findFirst.mockResolvedValueOnce({ id: "grant-1" });

      await service.hasPermission("user-1", "users.manage");

      expect(prisma.userRole.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        select: { roleId: true },
      });
    });
  });

  describe("getActingStaff", () => {
    it("looks up the staff row linked to the given user within the tenant", async () => {
      prisma.staff.findFirst.mockResolvedValueOnce({ id: "staff-1" });
      const result = await service.getActingStaff("tenant-1", "user-1");
      expect(result).toEqual({ id: "staff-1" });
      expect(prisma.staff.findFirst).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1", userId: "user-1", deletedAt: null },
      });
    });
  });

  describe("isClassTeacherOfSection", () => {
    it("returns true when the staff member is the section's class teacher", async () => {
      prisma.section.findFirst.mockResolvedValueOnce({ id: "section-1" });
      await expect(service.isClassTeacherOfSection("staff-1", "section-1")).resolves.toBe(true);
    });

    it("returns false when they are not", async () => {
      prisma.section.findFirst.mockResolvedValueOnce(null);
      await expect(service.isClassTeacherOfSection("staff-1", "section-1")).resolves.toBe(false);
    });
  });

  describe("isAssignedToSubject", () => {
    it("returns true when a matching assignment exists", async () => {
      prisma.teacherSubjectAssignment.findFirst.mockResolvedValueOnce({ id: "assignment-1" });
      const result = await service.isAssignedToSubject(
        "staff-1",
        "class-1",
        "subject-1",
        "session-1",
        "section-1",
      );
      expect(result).toBe(true);
      expect(prisma.teacherSubjectAssignment.findFirst).toHaveBeenCalledWith({
        where: {
          staffId: "staff-1",
          classId: "class-1",
          subjectId: "subject-1",
          academicSessionId: "session-1",
          deletedAt: null,
          OR: [{ sectionId: null }, { sectionId: "section-1" }],
        },
      });
    });

    it("only checks for a section-agnostic ('any section') assignment when sectionId is null", async () => {
      prisma.teacherSubjectAssignment.findFirst.mockResolvedValueOnce(null);
      await service.isAssignedToSubject("staff-1", "class-1", "subject-1", "session-1", null);
      expect(prisma.teacherSubjectAssignment.findFirst).toHaveBeenCalledWith({
        where: {
          staffId: "staff-1",
          classId: "class-1",
          subjectId: "subject-1",
          academicSessionId: "session-1",
          deletedAt: null,
          OR: [{ sectionId: null }],
        },
      });
    });
  });
});
