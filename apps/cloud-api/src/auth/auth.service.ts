import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";

import { PlanLimitsService } from "../common/plan-limits.service.js";
import { DbService } from "../db/db.service.js";
import { staffAllowsAccess } from "../staff/staff-status.js";
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
  branches: unknown[];
}

interface UserRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  full_name: string;
  email: string;
  password_hash: string | null;
}

// Sessions are online-only now: no offline grace period / EntitlementClaims
// concept. A logged-in client just needs a valid, refreshable access token.
@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  // `email` is only unique per (tenant_id, email) -- the same email can
  // legitimately exist in two different schools' tenants -- so a plain
  // cross-tenant email scan is ambiguous the moment more than one tenant
  // exists. `subdomain` is derived by the caller (AuthController, via
  // common/subdomain.ts's deriveSubdomainFromRequest) from the request's
  // Origin/Referer header, not supplied by the client body -- when present,
  // we resolve it to a tenant first (still a tenant-less lookup, via
  // queryUnscoped) and then scope the user lookup to it through the normal
  // RLS-enforced path, which is unambiguous. When it's absent (local dev,
  // or a tenant with no subdomain assigned yet), we fall back to the old
  // tenant-less scan via queryUnscoped, since that path never learns a
  // tenantId to scope a normal query by.
  async login(email: string, password: string, subdomain?: string): Promise<LoginResult> {
    let tenantId: string | undefined;
    if (subdomain) {
      const tenant = await this.db.queryUnscoped<{ id: string }>(
        "SELECT id FROM tenants WHERE subdomain = $1",
        [subdomain],
      );
      if (!tenant[0]) {
        throw new UnauthorizedException("Invalid email or password");
      }
      tenantId = tenant[0].id;
    }

    const found = tenantId
      ? await this.db.queryOne<UserRow>(
          tenantId,
          "SELECT * FROM users WHERE tenant_id = $1 AND email = $2 AND deleted_at IS NULL AND is_active = true",
          [tenantId, email],
        )
      : (
          await this.db.queryUnscoped<UserRow>(
            "SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL AND is_active = true LIMIT 1",
            [email],
          )
        )[0];

    if (!found || !found.password_hash) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(password, found.password_hash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.planLimits.assertTenantActive(found.tenant_id);
    await this.assertLinkedStaffAllowsAccess(found.tenant_id, found.id);

    const roles = await this.getRoleNames(found.tenant_id, found.id);
    const { access_token, refresh_token } = await this.issueTokenPair(found.id, found.tenant_id, found.branch_id, roles);

    return {
      access_token,
      refresh_token,
      user: {
        id: found.id,
        tenant_id: found.tenant_id,
        branch_id: found.branch_id,
        full_name: found.full_name,
        email: found.email,
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

    const user = await this.db.queryOne<UserRow>(
      payload.tenant_id,
      "SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND is_active = true",
      [payload.sub, payload.tenant_id],
    );
    if (!user) {
      throw new UnauthorizedException("User no longer active");
    }
    await this.planLimits.assertTenantActive(payload.tenant_id);
    await this.assertLinkedStaffAllowsAccess(payload.tenant_id, user.id);

    // Re-derive roles AND branch from the database rather than trusting the
    // refresh token's payload -- role/branch assignments may have changed
    // since it was issued.
    const roles = await this.getRoleNames(payload.tenant_id, user.id);
    const accessTtl = this.config.get<string>("JWT_ACCESS_TOKEN_TTL", "1h");
    const access_token = await this.jwt.signAsync(
      { sub: user.id, tenant_id: user.tenant_id, branch_id: user.branch_id, roles, type: "access" },
      { expiresIn: accessTtl as JwtSignOptions["expiresIn"] },
    );

    return { access_token };
  }

  async me(tenantId: string, userId: string): Promise<MeResult> {
    const user = await this.db.queryOne<UserRow>(
      tenantId,
      "SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND is_active = true",
      [userId, tenantId],
    );
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    await this.assertLinkedStaffAllowsAccess(tenantId, user.id);

    const roleRows = await this.db.query<{ id: string; name: string }>(
      tenantId,
      `SELECT r.id, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.tenant_id = $1 AND ur.user_id = $2`,
      [tenantId, user.id],
    );
    const roleIds = roleRows.map((r) => r.id);
    const roles = roleRows.map((r) => r.name);

    const permissions = roleIds.length
      ? [
          ...new Set(
            (
              await this.db.query<{ permission_key: string }>(
                tenantId,
                "SELECT DISTINCT permission_key FROM role_permissions WHERE tenant_id = $1 AND role_id = ANY($2) AND deleted_at IS NULL",
                [tenantId, roleIds],
              )
            ).map((g) => g.permission_key),
          ),
        ]
      : [];

    const branches = user.branch_id
      ? await this.db.query(
          tenantId,
          "SELECT * FROM branches WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL ORDER BY name ASC",
          [tenantId, user.branch_id],
        )
      : await this.db.query(
          tenantId,
          "SELECT * FROM branches WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC",
          [tenantId],
        );

    const tenant = await this.db.queryOne<{ id: string; name: string }>(
      tenantId,
      "SELECT id, name FROM tenants WHERE id = $1",
      [tenantId],
    );
    if (!tenant) {
      throw new UnauthorizedException("Tenant not found");
    }

    return {
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        branch_id: user.branch_id,
        full_name: user.full_name,
        email: user.email,
      },
      tenant,
      roles,
      permissions,
      branches,
    };
  }

  private async getRoleNames(tenantId: string, userId: string): Promise<string[]> {
    const rows = await this.db.query<{ name: string }>(
      tenantId,
      `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.tenant_id = $1 AND ur.user_id = $2`,
      [tenantId, userId],
    );
    return rows.map((r) => r.name);
  }

  // Not every User has a linked Staff row (e.g. a pure admin account), so
  // this only blocks when one exists and its status has moved off the
  // access-allowed set (relieved/terminated/inactive) -- login, refresh,
  // and /auth/me all call this so a relieved staff member is locked out
  // within one access-token TTL even if their session was already live.
  private async assertLinkedStaffAllowsAccess(tenantId: string, userId: string): Promise<void> {
    const staff = await this.db.queryOne<{ status: string }>(
      tenantId,
      "SELECT status FROM staff WHERE tenant_id = $1 AND user_id = $2 AND deleted_at IS NULL",
      [tenantId, userId],
    );
    if (staff && !staffAllowsAccess(staff.status)) {
      throw new UnauthorizedException("This staff account is no longer active. Contact your administrator.");
    }
  }

  private async issueTokenPair(userId: string, tenantId: string, branchId: string | null, roles: string[]) {
    const accessTtl = this.config.get<string>("JWT_ACCESS_TOKEN_TTL", "1h");
    const refreshTtl = this.config.get<string>("JWT_REFRESH_TOKEN_TTL", "30d");

    const access_token = await this.jwt.signAsync(
      { sub: userId, tenant_id: tenantId, branch_id: branchId, roles, type: "access" },
      { expiresIn: accessTtl as JwtSignOptions["expiresIn"] },
    );
    const refresh_token = await this.jwt.signAsync(
      { sub: userId, tenant_id: tenantId, branch_id: branchId, roles, type: "refresh" },
      { expiresIn: refreshTtl as JwtSignOptions["expiresIn"] },
    );

    return { access_token, refresh_token };
  }
}
