import { BadRequestException } from "@nestjs/common";

import { QrTokenService } from "./qr-token.service.js";

describe("QrTokenService", () => {
  let service: QrTokenService;

  beforeEach(() => {
    service = new QrTokenService();
  });

  it("round-trips a generated token", () => {
    const token = service.generate("student", "tenant-1", "student-1", 1);
    const parsed = service.parse(token);
    expect(parsed).toEqual({ type: "student", entityId: "student-1", version: 1 });
    expect(service.verifySignature(token, parsed, "tenant-1", 1)).toBe(true);
  });

  it("round-trips a staff token", () => {
    const token = service.generate("staff", "tenant-1", "staff-1", 3);
    const parsed = service.parse(token);
    expect(parsed).toEqual({ type: "staff", entityId: "staff-1", version: 3 });
    expect(service.verifySignature(token, parsed, "tenant-1", 3)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const token = service.generate("student", "tenant-1", "student-1", 1);
    const tampered = token.slice(0, -1) + (token.slice(-1) === "a" ? "b" : "a");
    const parsed = service.parse(tampered);
    expect(service.verifySignature(tampered, parsed, "tenant-1", 1)).toBe(false);
  });

  it("rejects a stale token once the row has moved on to a newer version", () => {
    const oldToken = service.generate("student", "tenant-1", "student-1", 1);
    const parsed = service.parse(oldToken);
    // the row's qrCodeVersion is now 2 (reissued) -- the old token's
    // signature was only ever valid for version 1.
    expect(service.verifySignature(oldToken, parsed, "tenant-1", 2)).toBe(false);
  });

  it("rejects a token signed for a different tenant", () => {
    const token = service.generate("student", "tenant-1", "student-1", 1);
    const parsed = service.parse(token);
    expect(service.verifySignature(token, parsed, "tenant-2", 1)).toBe(false);
  });

  it("throws BadRequestException on garbage input", () => {
    expect(() => service.parse("not-a-token")).toThrow(BadRequestException);
    expect(() => service.parse("")).toThrow(BadRequestException);
    expect(() => service.parse("VQR1.X.student-1.1.abc123")).toThrow(BadRequestException);
    expect(() => service.parse("VQR1.S.student-1.0.abc123")).toThrow(BadRequestException);
    expect(() => service.parse("VQR1.S.student-1.notanumber.abc123")).toThrow(BadRequestException);
    expect(() => service.parse("VQR2.S.student-1.1.abc123")).toThrow(BadRequestException);
  });
});
