import { createHmac } from "node:crypto";

import { BadRequestException, Injectable } from "@nestjs/common";

export type QrEntityType = "student" | "staff";

const TYPE_CODE: Record<QrEntityType, string> = { student: "S", staff: "T" };
const CODE_TYPE: Record<string, QrEntityType> = { S: "student", T: "staff" };
const PREFIX = "VQR1";

export interface ParsedQrToken {
  type: QrEntityType;
  entityId: string;
  version: number;
}

// A student/staff QR code encodes VQR1.<T>.<entityId>.<version>.<sig> --
// computed on demand, never stored. There's no expiry embedded (a printed
// ID card needs to keep scanning all year); reissuing is just bumping the
// person's qrCodeVersion column, which invalidates every previously-printed
// code for them instantly since verifySignature always checks against the
// row's *current* version.
@Injectable()
export class QrTokenService {
  private readonly secret = process.env.QR_SIGNING_SECRET ?? "dev-only-qr-secret-change-me";

  private sign(type: QrEntityType, tenantId: string, entityId: string, version: number): string {
    return createHmac("sha256", this.secret)
      .update(`${TYPE_CODE[type]}:${tenantId}:${entityId}:${version}`)
      .digest("hex")
      .slice(0, 24);
  }

  generate(type: QrEntityType, tenantId: string, entityId: string, version: number): string {
    const sig = this.sign(type, tenantId, entityId, version);
    return `${PREFIX}.${TYPE_CODE[type]}.${entityId}.${version}.${sig}`;
  }

  parse(token: string): ParsedQrToken {
    const parts = token.split(".");
    if (parts.length !== 5 || parts[0] !== PREFIX) {
      throw new BadRequestException("invalid QR code");
    }
    const [, typeCode, entityId, versionStr, sig] = parts;
    const type = CODE_TYPE[typeCode];
    const version = Number(versionStr);
    if (!type || !entityId || !Number.isInteger(version) || version < 1 || !sig) {
      throw new BadRequestException("invalid QR code");
    }
    return { type, entityId, version };
  }

  // Recomputes against currentVersion (the entity row's live qrCodeVersion),
  // not parsed.version (the token's own embedded version) -- otherwise a
  // stale-but-internally-consistent token would always verify, since its
  // signature was already correct for the version it was printed with.
  // A version mismatch changes the signed payload, so the comparison fails
  // naturally; the caller distinguishes "stale" from "tampered" by checking
  // parsed.version against currentVersion itself.
  verifySignature(token: string, parsed: ParsedQrToken, tenantId: string, currentVersion: number): boolean {
    const sig = token.split(".")[4];
    return sig === this.sign(parsed.type, tenantId, parsed.entityId, currentVersion);
  }
}
