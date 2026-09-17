import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";

import type { PresignedDownload, PresignedUpload, StorageDriver } from "./storage.types.js";

const TTL_SECONDS = 900;

// Real S3 driver, not a stub -- becomes active the moment STORAGE_DRIVER=s3
// and AWS_S3_BUCKET/AWS_REGION/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are
// set (the SDK picks the credentials up from the environment automatically).
// No other code changes are needed to cut over from LocalStorageDriver.
@Injectable()
export class S3StorageDriver implements StorageDriver {
  private readonly bucket = process.env.AWS_S3_BUCKET ?? "";
  private readonly client = new S3Client({ region: process.env.AWS_REGION ?? "ap-south-1" });

  // ContentType is deliberately not passed to PutObjectCommand -- doing so
  // would require the uploader to send back that exact Content-Type header
  // or the signature check fails, and the frontend already sets one
  // correctly from the File API without the server needing to echo it.
  async createUploadUrl(key: string, _contentType: string): Promise<PresignedUpload> {
    const url = await getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: TTL_SECONDS,
    });
    return { url, method: "PUT", expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString() };
  }

  async createDownloadUrl(key: string): Promise<PresignedDownload> {
    const url = await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: TTL_SECONDS,
    });
    return { url, expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString() };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
