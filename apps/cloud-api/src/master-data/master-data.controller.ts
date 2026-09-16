import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { PermissionsGuard } from "../common/permissions.guard.js";
import { CreateMasterDataItemDto } from "./dto/create-master-data-item.dto.js";
import { UpdateMasterDataItemDto } from "./dto/update-master-data-item.dto.js";
import { MasterDataService } from "./master-data.service.js";

// No @RequirePermission here -- GET is open to any logged-in tenant user
// (dropdown data), and write permission depends on the per-request `type`,
// which MasterDataService checks dynamically (see assertCanManage).
@Controller("master-data")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MasterDataController {
  constructor(private readonly masterDataService: MasterDataService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("type") type: string) {
    return this.masterDataService.listItems(user.tenant_id, type);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateMasterDataItemDto) {
    return this.masterDataService.createItem(user.tenant_id, user.sub, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateMasterDataItemDto) {
    return this.masterDataService.updateItem(user.tenant_id, user.sub, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.masterDataService.deleteItem(user.tenant_id, user.sub, id);
  }
}
