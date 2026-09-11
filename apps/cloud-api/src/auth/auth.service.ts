import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";

import { PrismaService } from "../prisma/prisma.service.js";

export interface EntitlementClaims {
  tenant_id: string;
  branch_ids: string[] | "all";
  subscription_status: string;
  expires_at: string;
}

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    tenant_id: string;
    full_name: string;
    email: string;
    roles: string[];
  };
  entitlement: EntitlementClaims;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, isActive: true },
      include: { userRoles: { include: { role: true } }, tenant: true },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const roles = user.userRoles.map((ur) => ur.role.name);

    const payload = { sub: user.id, tenant_id: user.tenantId, roles };
    const accessTtl = this.config.get<string>("JWT_ACCESS_TOKEN_TTL", "1h");
    const refreshTtl = this.config.get<string>("JWT_REFRESH_TOKEN_TTL", "30d");
    const access_token = await this.jwt.signAsync(payload, {
      expiresIn: accessTtl as JwtSignOptions["expiresIn"],
    });
    const refresh_token = await this.jwt.signAsync(payload, {
      expiresIn: refreshTtl as JwtSignOptions["expiresIn"],
    });

    const graceDays = Number(this.config.get("ENTITLEMENT_OFFLINE_GRACE_DAYS", "14"));
    const expiresAt = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000);

    const branchIds = user.branchId ? [user.branchId] : "all";

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        tenant_id: user.tenantId,
        full_name: user.fullName,
        email: user.email,
        roles,
      },
      entitlement: {
        tenant_id: user.tenantId,
        branch_ids: branchIds,
        subscription_status: user.tenant.subscriptionStatus,
        expires_at: expiresAt.toISOString(),
      },
    };
  }
}
