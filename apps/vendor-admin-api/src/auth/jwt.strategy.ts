import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

export interface VendorAdminJwtPayload {
  sub: string;
  email: string;
}

// Separate secret from cloud-api's JWT_SECRET -- a vendor operator token
// must never be accepted by cloud-api's tenant-scoped endpoints, or vice
// versa (see docs comment in .env.example for VENDOR_JWT_SECRET).
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("VENDOR_JWT_SECRET", "dev-only-change-me-vendor"),
    });
  }

  validate(payload: VendorAdminJwtPayload): VendorAdminJwtPayload {
    return payload;
  }
}
