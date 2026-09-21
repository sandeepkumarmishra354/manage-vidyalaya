// Vendor-controlled licensing catalog: which plan tiers exist and what each
// one allows. Follows the exact precedent already set by
// TOGGLEABLE_MODULES/SYSTEM_ROLE_PERMISSIONS in permission-catalog.ts --
// small, rarely-changing catalogs live in code (reviewed via git, deployed
// with a release), not as runtime-editable DB rows. Only the per-tenant
// assignment (which tier a given school is on) is data, in tenants.plan_tier.
import { TOGGLEABLE_MODULES, type ToggleableModule } from "./permission-catalog.js";

export const PLAN_TIERS = ["trial", "silver", "gold"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

// A new tenant gets full Gold access for this many days before the vendor
// must assign it a real plan (see PlanLimitsService.getPlanTier).
export const TRIAL_PERIOD_DAYS = 30;

export interface PlanLimits {
  max_branches: number;
  max_super_admins: number;
  max_branch_admins: number;
  max_students: number;
  max_staff: number;
  modules: readonly ToggleableModule[];
}

const GOLD_LIMITS: PlanLimits = {
  max_branches: 5,
  max_super_admins: 2,
  max_branch_admins: 10,
  max_students: 2000,
  max_staff: 200,
  modules: TOGGLEABLE_MODULES,
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  // Time-boxed by tenants.trial_ends_at, not a different limits shape --
  // a trial tenant gets the same ceiling as Gold until it expires.
  trial: GOLD_LIMITS,
  silver: {
    max_branches: 1,
    max_super_admins: 1,
    max_branch_admins: 2,
    max_students: 300,
    max_staff: 30,
    modules: [],
  },
  gold: GOLD_LIMITS,
};
