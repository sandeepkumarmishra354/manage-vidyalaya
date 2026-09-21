import { IsBoolean, IsIn, IsOptional } from "class-validator";

import { PLAN_TIERS, type PlanTier } from "../../plan-catalog.js";

export class UpdateTenantDto {
  @IsOptional()
  @IsIn(PLAN_TIERS)
  plan_tier?: PlanTier;

  // ISO date string, or null to clear (open-ended). Omitted entirely
  // means "don't touch this field" -- validated loosely (not @IsISO8601)
  // specifically so `null` is accepted alongside a date string.
  @IsOptional()
  trial_ends_at?: string | null;

  @IsOptional()
  subscription_expires_at?: string | null;

  @IsOptional()
  @IsBoolean()
  is_suspended?: boolean;
}
