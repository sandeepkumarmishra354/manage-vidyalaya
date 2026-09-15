import { randomUUID } from "node:crypto";

import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";

import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateUserDto } from "./dto/create-user.dto.js";

/// `password_hash` is only ever set server-side -- the frontend never
/// computes or stores one, it only submits a plaintext password over HTTPS
/// on create/reset.
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(callerTenantId: string, dto: CreateUserDto): Promise<{ id: string }> {
    if (callerTenantId !== dto.tenant_id) {
      throw new ForbiddenException("Cannot create a user for another tenant");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const now = new Date();

    const user = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        tenantId: dto.tenant_id,
        branchId: dto.branch_id ?? null,
        fullName: dto.full_name,
        email: dto.email,
        passwordHash,
        isActive: true,
        updatedAt: now,
      },
    });

    return { id: user.id };
  }

  async resetPassword(callerTenantId: string, userId: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("user not found");
    }
    if (user.tenantId !== callerTenantId) {
      throw new ForbiddenException("Cannot reset a password for another tenant's user");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }
}
