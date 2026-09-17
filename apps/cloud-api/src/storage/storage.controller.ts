import { BadRequestException, Controller, Get, Param, Put, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { LocalStorageDriver } from "./local-storage.driver.js";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB -- generous for a document/receipt attachment

function readRawBody(req: Request, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) {
        req.destroy();
        reject(new BadRequestException(`file exceeds the ${limit} byte upload limit`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Backs the presigned URLs LocalStorageDriver hands out -- validates the
// HMAC signature/expiry itself (LocalStorageDriver.verify) so this behaves
// like a real presigned URL rather than an open read/write endpoint, and is
// intentionally not behind JwtAuthGuard: the signature is the credential,
// same as a real S3 presigned URL. Unused once STORAGE_DRIVER=s3, since
// those presigned URLs point directly at S3.
@Controller("storage/objects")
export class StorageController {
  constructor(private readonly local: LocalStorageDriver) {}

  @Put(":key")
  async upload(@Param("key") key: string, @Query("exp") exp: string, @Query("sig") sig: string, @Req() req: Request) {
    this.local.verify("PUT", key, exp, sig);
    const contentType = req.headers["content-type"] ?? "application/octet-stream";
    const body = await readRawBody(req, MAX_UPLOAD_BYTES);
    await this.local.writeObject(key, contentType, body);
    return { ok: true };
  }

  @Get(":key")
  async download(
    @Param("key") key: string,
    @Query("exp") exp: string,
    @Query("sig") sig: string,
    @Res() res: Response,
  ) {
    this.local.verify("GET", key, exp, sig);
    const { data, contentType } = await this.local.readObject(key);
    res.setHeader("Content-Type", contentType);
    res.send(data);
  }
}
