import { Module } from "@nestjs/common";

import { LocalStorageDriver } from "./local-storage.driver.js";
import { S3StorageDriver } from "./s3-storage.driver.js";
import { StorageController } from "./storage.controller.js";
import { StorageService } from "./storage.service.js";

@Module({
  controllers: [StorageController],
  providers: [LocalStorageDriver, S3StorageDriver, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
