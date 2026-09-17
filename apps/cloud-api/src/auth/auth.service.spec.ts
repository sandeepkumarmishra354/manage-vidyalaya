import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../prisma/prisma.service.js";
import { AuthService } from "./auth.service.js";

function makePrismaMock() {
  return {
    user: { findFirst: vi.fn() },
    staff: { findFirst: vi.fn() },
  } as unknown as PrismaService & {
    user: { findFirst: ReturnType<typeof vi.fn> };
    staff: { findFirst: ReturnType<typeof vi.fn> };
  };
}

function makeJwtMock() {
  return { signAsync: vi.fn().mockResolvedValue("signed-token"), verifyAsync: vi.fn() };
}

function makeConfigMock() {
  return { get: vi.fn((_key: string, fallback?: unknown) => fallback) };
}

const PASSWORD = "correct-horse-battery-staple";
let passwordHash: string;

describe("AuthService.login", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AuthService;

  beforeEach(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
    prisma = makePrismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AuthService(prisma, makeJwtMock() as any, makeConfigMock() as any);
  });

  it("logs in a user with no linked staff record", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      id: "user-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
      fullName: "Admin",
      email: "admin@example.com",
      passwordHash,
      userRoles: [],
    });
    prisma.staff.findFirst.mockResolvedValueOnce(null);

    const result = await service.login("admin@example.com", PASSWORD);
    expect(result.access_token).toBe("signed-token");
  });

  it("logs in a staff member whose linked Staff.status is active", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      id: "user-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
      fullName: "Teacher",
      email: "teacher@example.com",
      passwordHash,
      userRoles: [],
    });
    prisma.staff.findFirst.mockResolvedValueOnce({ id: "staff-1", status: "active" });

    const result = await service.login("teacher@example.com", PASSWORD);
    expect(result.access_token).toBe("signed-token");
  });

  it("logs in a staff member on_leave", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      id: "user-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
      fullName: "Teacher",
      email: "teacher@example.com",
      passwordHash,
      userRoles: [],
    });
    prisma.staff.findFirst.mockResolvedValueOnce({ id: "staff-1", status: "on_leave" });

    await expect(service.login("teacher@example.com", PASSWORD)).resolves.toBeDefined();
  });

  it("rejects a relieved staff member even with the correct password", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      id: "user-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
      fullName: "Ex Teacher",
      email: "ex-teacher@example.com",
      passwordHash,
      userRoles: [],
    });
    prisma.staff.findFirst.mockResolvedValueOnce({ id: "staff-1", status: "relieved" });

    await expect(service.login("ex-teacher@example.com", PASSWORD)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a terminated staff member", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      id: "user-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
      fullName: "Ex Staff",
      email: "ex-staff@example.com",
      passwordHash,
      userRoles: [],
    });
    prisma.staff.findFirst.mockResolvedValueOnce({ id: "staff-1", status: "terminated" });

    await expect(service.login("ex-staff@example.com", PASSWORD)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("still rejects a wrong password before ever checking staff status", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      id: "user-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
      fullName: "Teacher",
      email: "teacher@example.com",
      passwordHash,
      userRoles: [],
    });

    await expect(service.login("teacher@example.com", "wrong-password")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.staff.findFirst).not.toHaveBeenCalled();
  });
});
