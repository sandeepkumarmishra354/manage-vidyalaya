import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { UsersService } from "./users.service.js";

function makePrismaMock() {
  const tx = { user: { create: vi.fn() }, staff: { update: vi.fn() } };
  return {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    staff: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
  } as unknown as PrismaService & {
    staff: { findFirst: ReturnType<typeof vi.fn> };
    __tx: typeof tx;
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("UsersService", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: UsersService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new UsersService(prisma, audit);
  });

  describe("createUser", () => {
    it("rejects creating a user for another tenant", async () => {
      await expect(
        service.createUser("tenant-a", {
          tenant_id: "tenant-b",
          full_name: "Someone",
          email: "someone@example.com",
          password: "password123",
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("hashes the password rather than storing it in plaintext", async () => {
      (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "user-1" });

      await service.createUser("tenant-a", {
        tenant_id: "tenant-a",
        full_name: "Jane Teacher",
        email: "jane@example.com",
        password: "correct-horse-battery-staple",
      });

      const createCall = (prisma.user.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.passwordHash).toBeDefined();
      expect(createCall.data.passwordHash).not.toBe("correct-horse-battery-staple");
      expect(createCall.data.passwordHash.length).toBeGreaterThan(20);
    });

    it("returns the new user's id", async () => {
      (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "user-42" });

      const result = await service.createUser("tenant-a", {
        tenant_id: "tenant-a",
        full_name: "Jane Teacher",
        email: "jane@example.com",
        password: "correct-horse-battery-staple",
      });

      expect(result).toEqual({ id: "user-42" });
    });
  });

  describe("resetPassword", () => {
    it("throws NotFoundException for a user that doesn't exist", async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      await expect(
        service.resetPassword("tenant-a", "actor-1", "missing-user", "new-password"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects resetting a password for another tenant's user", async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "user-1",
        tenantId: "tenant-b",
      });

      await expect(
        service.resetPassword("tenant-a", "actor-1", "user-1", "new-password"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("hashes the new password before storing it", async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "user-1",
        tenantId: "tenant-a",
      });

      await service.resetPassword("tenant-a", "actor-1", "user-1", "brand-new-password");

      const updateCall = (prisma.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: "user-1" });
      expect(updateCall.data.passwordHash).not.toBe("brand-new-password");
      expect(updateCall.data.passwordHash.length).toBeGreaterThan(20);
    });
  });

  describe("createStaffLogin", () => {
    it("404s when the target staff member doesn't exist", async () => {
      prisma.staff.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createStaffLogin("tenant-a", "actor-1", {
          staff_id: "missing",
          email: "new@example.com",
          full_name: "New Teacher",
          initial_password: "correct-horse-battery-staple",
          branch_id: "branch-1",
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects creating a login for a relieved staff member", async () => {
      prisma.staff.findFirst.mockResolvedValueOnce({ id: "staff-1", status: "relieved" });

      await expect(
        service.createStaffLogin("tenant-a", "actor-1", {
          staff_id: "staff-1",
          email: "ex@example.com",
          full_name: "Ex Teacher",
          initial_password: "correct-horse-battery-staple",
          branch_id: "branch-1",
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("creates a login for an active staff member", async () => {
      prisma.staff.findFirst.mockResolvedValueOnce({ id: "staff-1", status: "active" });
      prisma.__tx.user.create.mockResolvedValueOnce({ id: "user-1" });

      const result = await service.createStaffLogin("tenant-a", "actor-1", {
        staff_id: "staff-1",
        email: "teacher@example.com",
        full_name: "Teacher",
        initial_password: "correct-horse-battery-staple",
        branch_id: "branch-1",
      });

      expect(result).toEqual({ id: "user-1" });
      expect(prisma.__tx.staff.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "staff-1" }, data: expect.objectContaining({ userId: "user-1" }) }),
      );
    });
  });

  describe("listUsers", () => {
    it("scopes to the tenant with no extra filters when none are given", async () => {
      await service.listUsers("tenant-a");
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-a", deletedAt: null },
        }),
      );
    });

    it("combines search and role filters with AND", async () => {
      await service.listUsers("tenant-a", "jane", "role-1");
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: "tenant-a",
            deletedAt: null,
            userRoles: { some: { roleId: "role-1" } },
            OR: [
              { fullName: { contains: "jane", mode: "insensitive" } },
              { email: { contains: "jane", mode: "insensitive" } },
            ],
          },
        }),
      );
    });
  });
});
