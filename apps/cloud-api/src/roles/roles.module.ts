import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { PermissionsCatalogController, RolesController } from "./roles.controller.js";
import { RolesService } from "./roles.service.js";

@Module({
  imports: [AuditModule],
  controllers: [RolesController, PermissionsCatalogController],
  providers: [RolesService],
})
export class RolesModule {}
