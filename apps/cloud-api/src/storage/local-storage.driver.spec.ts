import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";

import { LocalStorageDriver } from "./local-storage.driver.js";

describe("LocalStorageDriver", () => {
  let driver: LocalStorageDriver;

  beforeEach(() => {
    driver = new LocalStorageDriver();
  });

  it("signs an upload URL that verifies successfully for PUT with the same key", () => {
    const { url } = driver.createUploadUrl("doc-1.pdf", "application/pdf");
    const params = new URL(url).searchParams;
    expect(() => driver.verify("PUT", "doc-1.pdf", params.get("exp")!, params.get("sig")!)).not.toThrow();
  });

  it("rejects a GET verify against a PUT-signed URL", () => {
    const { url } = driver.createUploadUrl("doc-1.pdf", "application/pdf");
    const params = new URL(url).searchParams;
    expect(() => driver.verify("GET", "doc-1.pdf", params.get("exp")!, params.get("sig")!)).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a tampered signature", () => {
    const { url } = driver.createUploadUrl("doc-1.pdf", "application/pdf");
    const params = new URL(url).searchParams;
    expect(() => driver.verify("PUT", "doc-1.pdf", params.get("exp")!, "deadbeef")).toThrow(UnauthorizedException);
  });

  it("rejects a signature for a different key", () => {
    const { url } = driver.createUploadUrl("doc-1.pdf", "application/pdf");
    const params = new URL(url).searchParams;
    expect(() => driver.verify("PUT", "doc-2.pdf", params.get("exp")!, params.get("sig")!)).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects an expired signature", () => {
    const pastExpiry = String(Date.now() - 1000);
    expect(() => driver.verify("GET", "doc-1.pdf", pastExpiry, "anything")).toThrow(UnauthorizedException);
  });

  it("rejects a key containing path-traversal characters", () => {
    expect(() => driver.createUploadUrl("../../etc/passwd", "text/plain")).toThrow(BadRequestException);
  });
});
