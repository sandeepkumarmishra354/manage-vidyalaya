import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { CreateTenantDto } from "./dto/create-tenant.dto.js";
import { UpdateTenantDto } from "./dto/update-tenant.dto.js";
import { TenantsService } from "./tenants.service.js";

@Controller("tenants")
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  list() {
    return this.tenantsService.listTenants();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.tenantsService.getTenant(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.updateTenant(id, dto);
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.createTenant(dto);
  }
}
