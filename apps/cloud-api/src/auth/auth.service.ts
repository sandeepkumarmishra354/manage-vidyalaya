import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import type { Branch } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service.js";
import type { JwtPayload } from "./jwt.strategy.js";

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    tenant_id: string;
    branch_id: string | null;
    full_name: string;
    email: string;
    roles: string[];
  };
}

export interface RefreshResult {
  access_token: string;
}

export interface MeResult {
  user: {
    id: string;
    tenant_id: string;
    branch_id: string | null;
    full_name: string;
    email: string;
  };
  tenant: {
    id: string;
    name: string;
  };
  roles: string[];
  permissions: string[];
  branches: Branch[];
}

// Sessions are online-only now: no offline grace period / EntitlementClaims
// concept. A logged-in client just needs a valid, refreshable access token.
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
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const roles = user.userRoles.map((ur) => ur.role.name);
    const { access_token, refresh_token } = await this.issueTokenPair(user.id, user.tenantId, roles);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        tenant_id: user.tenantId,
        branch_id: user.branchId,
        full_name: user.fullName,
        email: user.email,
        roles,
      },
    };
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>("JWT_SECRET", "dev-only-change-me"),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    if (payload.type !== "refresh") {
      throw new UnauthorizedException("Not a refresh token");
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) {
      throw new UnauthorizedException("User no longer active");
    }

    // Re-derive roles from the database rather than trusting the refresh
    // token's payload -- role assignments may have changed since it was
    // issued.
    const roles = user.userRoles.map((ur) => ur.role.name);
    const accessTtl = this.config.get<string>("JWT_ACCESS_TOKEN_TTL", "1h");
    const access_token = await this.jwt.signAsync(
      { sub: user.id, tenant_id: user.tenantId, roles, type: "access" },
      { expiresIn: accessTtl as JwtSignOptions["expiresIn"] },
    );

    return { access_token };
  }

  async me(userId: string): Promise<MeResult> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isActive: true },
      include: { userRoles: { include: { role: true } }, tenant: true },
    });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const roleIds = user.userRoles.map((ur) => ur.roleId);
    const roles = user.userRoles.map((ur) => ur.role.name);

    const grants = roleIds.length
      ? await this.prisma.rolePermission.findMany({
          where: { roleId: { in: roleIds }, deletedAt: null },
          select: { permissionKey: true },
        })
      : [];
    const permissions = [...new Set(grants.map((g) => g.permissionKey))];

    const branches = await this.prisma.branch.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...(user.branchId ? { id: user.branchId } : {}),
      },
      orderBy: { name: "asc" },
    });

    return {
      user: {
        id: user.id,
        tenant_id: user.tenantId,
        branch_id: user.branchId,
        full_name: user.fullName,
        email: user.email,
      },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
      },
      roles,
      permissions,
      branches,
    };
  }

  private async issueTokenPair(userId: string, tenantId: string, roles: string[]) {
    const accessTtl = this.config.get<string>("JWT_ACCESS_TOKEN_TTL", "1h");
    const refreshTtl = this.config.get<string>("JWT_REFRESH_TOKEN_TTL", "30d");

    const access_token = await this.jwt.signAsync(
      { sub: userId, tenant_id: tenantId, roles, type: "access" },
      { expiresIn: accessTtl as JwtSignOptions["expiresIn"] },
    );
    const refresh_token = await this.jwt.signAsync(
      { sub: userId, tenant_id: tenantId, roles, type: "refresh" },
      { expiresIn: refreshTtl as JwtSignOptions["expiresIn"] },
    );

    return { access_token, refresh_token };
  }
}
