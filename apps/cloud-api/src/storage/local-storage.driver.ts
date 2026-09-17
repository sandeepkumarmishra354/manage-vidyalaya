import { createHmac } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";

import type { PresignedDownload, PresignedUpload, StorageDriver } from "./storage.types.js";

const TTL_SECONDS = 900; // 15 minutes, matches a typical S3 presign default
const KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

// Local "dummy" storage driver -- functional today, not a stub. Signs URLs
// with HMAC-SHA256 over (method, key, expiry) the same way a real presigned
// S3 URL is validated, and StorageController checks that signature itself
// instead of trusting an open read/write endpoint. Swappable for
// S3StorageDriver via STORAGE_DRIVER=s3 with no other code changes -- see
// StorageService.
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly secret = process.env.STORAGE_SIGNING_SECRET ?? "dev-only-storage-secret-change-me";
  private readonly baseUrl = process.env.PUBLIC_API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
  private readonly dir = process.env.STORAGE_LOCAL_DIR ?? join(process.cwd(), "storage-data");

  private sign(method: "PUT" | "GET", key: string, expiresAt: number): string {
    return createHmac("sha256", this.secret).update(`${method}:${key}:${expiresAt}`).digest("hex");
  }

  /** Called by StorageController before touching disk. Throws if the key/expiry/signature don't check out. */
  verify(method: "PUT" | "GET", key: string, expiresAtMs: string, signature: string): void {
    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException("invalid storage key");
    }
    const expiresAt = Number(expiresAtMs);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      throw new UnauthorizedException("signed URL has expired");
    }
    if (this.sign(method, key, expiresAt) !== signature) {
      throw new UnauthorizedException("invalid signature");
    }
  }

  createUploadUrl(key: string, contentType: string): PresignedUpload {
    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException("invalid storage key");
    }
    const expiresAt = Date.now() + TTL_SECONDS * 1000;
    return {
      url: `${this.baseUrl}/storage/objects/${key}?exp=${expiresAt}&sig=${this.sign("PUT", key, expiresAt)}`,
      method: "PUT",
      expires_at: new Date(expiresAt).toISOString(),
    };
  }

  createDownloadUrl(key: string): PresignedDownload {
    const expiresAt = Date.now() + TTL_SECONDS * 1000;
    return {
      url: `${this.baseUrl}/storage/objects/${key}?exp=${expiresAt}&sig=${this.sign("GET", key, expiresAt)}`,
      expires_at: new Date(expiresAt).toISOString(),
    };
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await rm(this.objectPath(key));
      await rm(this.metaPath(key));
    } catch {
      // best-effort -- a missing file isn't an error here
    }
  }

  objectPath(key: string): string {
    return join(this.dir, key);
  }

  metaPath(key: string): string {
    return join(this.dir, `${key}.meta.json`);
  }

  async writeObject(key: string, contentType: string, data: Buffer): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.objectPath(key), data);
    await writeFile(this.metaPath(key), JSON.stringify({ contentType }));
  }

  async readObject(key: string): Promise<{ data: Buffer; contentType: string }> {
    const data = await readFile(this.objectPath(key));
    let contentType = "application/octet-stream";
    try {
      const meta = JSON.parse(await readFile(this.metaPath(key), "utf-8")) as { contentType?: string };
      contentType = meta.contentType ?? contentType;
    } catch {
      // no meta file -- fall back to a generic content type
    }
    return { data, contentType };
  }
}
