import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";

import { DbService } from "../db/db.service.js";

interface VendorAdminRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const found = await this.db.queryOne<VendorAdminRow>("SELECT * FROM vendor_admins WHERE email = $1", [email]);
    if (!found) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const passwordMatches = await bcrypt.compare(password, found.password_hash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const ttl = this.config.get<string>("VENDOR_JWT_TOKEN_TTL", "12h");
    const access_token = await this.jwt.signAsync(
      { sub: found.id, email: found.email },
      { expiresIn: ttl as JwtSignOptions["expiresIn"] },
    );

    return { access_token, admin: { id: found.id, email: found.email, full_name: found.full_name } };
  }
}
