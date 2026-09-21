import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppController } from "./app.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { DbModule } from "./db/db.module.js";
import { TenantsModule } from "./tenants/tenants.module.js";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule, AuthModule, TenantsModule],
  controllers: [AppController],
})
export class AppModule {}
