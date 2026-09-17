import { Module } from "@nestjs/common";

import { QrTokenService } from "./qr-token.service.js";

@Module({
  providers: [QrTokenService],
  exports: [QrTokenService],
})
export class QrModule {}
