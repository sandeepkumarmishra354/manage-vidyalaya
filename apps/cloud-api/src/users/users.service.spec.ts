import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../prisma/prisma.service.js";
import { UsersService } from "./users.service.js";

function makePrismaMock() {
  return {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as PrismaService;
}

describe("UsersService", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: UsersService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new UsersService(prisma);
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

      await expect(service.resetPassword("tenant-a", "missing-user", "new-password")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("rejects resetting a password for another tenant's user", async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "user-1",
        tenantId: "tenant-b",
      });

      await expect(service.resetPassword("tenant-a", "user-1", "new-password")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("hashes the new password before storing it", async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "user-1",
        tenantId: "tenant-a",
      });

      await service.resetPassword("tenant-a", "user-1", "brand-new-password");

      const updateCall = (prisma.user.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: "user-1" });
      expect(updateCall.data.passwordHash).not.toBe("brand-new-password");
      expect(updateCall.data.passwordHash.length).toBeGreaterThan(20);
    });
  });
});
