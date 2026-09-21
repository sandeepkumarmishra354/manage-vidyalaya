import { Module } from "@nestjs/common";

import { PermissionsCatalogController, RolesController } from "./roles.controller.js";
import { RolesService } from "./roles.service.js";

@Module({
  controllers: [RolesController, PermissionsCatalogController],
  providers: [RolesService],
})
export class RolesModule {}
