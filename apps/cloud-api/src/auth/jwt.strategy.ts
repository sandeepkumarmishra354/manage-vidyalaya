import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

import { PlanLimitsService } from "../common/plan-limits.service.js";

export interface JwtPayload {
  sub: string;
  tenant_id: string;
  // The user's home branch, when they're branch-scoped (e.g. a per-branch
  // admin or staff member) -- null for a user with cross-branch access
  // (e.g. super_admin). Always the server's own derived value, re-fetched
  // fresh on every login/refresh -- never trust a client-submitted branch.
  branch_id: string | null;
  roles: string[];
  type: "access" | "refresh";
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly planLimits: PlanLimitsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET", "dev-only-change-me"),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Reject a refresh token presented as a bearer access token -- refresh
    // tokens are only ever handed to POST /auth/refresh, never accepted by
    // JwtAuthGuard-protected routes.
    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type");
    }
    // Runs on every authenticated request (not just login/refresh) so a
    // tenant suspended or expired mid-session is locked out on its very
    // next API call, instead of only the next time it tries to log in.
    await this.planLimits.assertTenantActive(payload.tenant_id);
    return payload;
  }
}
