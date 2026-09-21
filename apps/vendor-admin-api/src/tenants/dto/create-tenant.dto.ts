import { IsEmail, IsIn, IsOptional, IsString, Matches } from "class-validator";

import { PLAN_TIERS, type PlanTier } from "../../plan-catalog.js";

export class CreateTenantDto {
  @IsString()
  school_name!: string;

  @Matches(/^[a-z0-9-]+$/, { message: "subdomain must be lowercase letters, digits, and hyphens only" })
  subdomain!: string;

  @IsString()
  branch_name!: string;

  @IsString()
  branch_code!: string;

  @IsString()
  admin_name!: string;

  @IsEmail()
  admin_email!: string;

  @IsOptional()
  @IsString()
  admin_password?: string;

  @IsOptional()
  @IsIn(PLAN_TIERS)
  plan_tier?: PlanTier;
}
