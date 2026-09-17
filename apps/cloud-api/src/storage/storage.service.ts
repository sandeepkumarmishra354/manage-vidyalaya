import { Injectable } from "@nestjs/common";

import { LocalStorageDriver } from "./local-storage.driver.js";
import { S3StorageDriver } from "./s3-storage.driver.js";
import type { PresignedDownload, PresignedUpload, StorageDriver } from "./storage.types.js";

// Picks the storage driver once per call based on STORAGE_DRIVER (default
// "local", the dummy-but-functional driver -- see LocalStorageDriver).
// Setting STORAGE_DRIVER=s3 plus the AWS_* env vars switches every caller
// of this service to real S3 presigned URLs with no other code changes.
@Injectable()
export class StorageService implements StorageDriver {
  constructor(
    private readonly local: LocalStorageDriver,
    private readonly s3: S3StorageDriver,
  ) {}

  private get driver(): StorageDriver {
    return process.env.STORAGE_DRIVER === "s3" ? this.s3 : this.local;
  }

  createUploadUrl(key: string, contentType: string): Promise<PresignedUpload> | PresignedUpload {
    return this.driver.createUploadUrl(key, contentType);
  }

  createDownloadUrl(key: string): Promise<PresignedDownload> | PresignedDownload {
    return this.driver.createDownloadUrl(key);
  }

  deleteObject(key: string): Promise<void> {
    return this.driver.deleteObject(key);
  }
}
