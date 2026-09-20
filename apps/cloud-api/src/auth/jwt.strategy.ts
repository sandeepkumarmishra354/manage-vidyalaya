import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

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
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET", "dev-only-change-me"),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    // Reject a refresh token presented as a bearer access token -- refresh
    // tokens are only ever handed to POST /auth/refresh, never accepted by
    // JwtAuthGuard-protected routes.
    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type");
    }
    return payload;
  }
}
