// Duplicated from apps/cloud-api/src/common/plan-catalog.ts (that copy is
// the source of truth -- keep the two in sync by hand). Small and
// dependency-free enough that a real shared package isn't worth it yet;
// this app only needs it to validate/display a tenant's plan_tier and
// show its limits, not to enforce anything itself (cloud-api enforces).
export const PLAN_TIERS = ["trial", "silver", "gold"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const TRIAL_PERIOD_DAYS = 30;

// Mirrors permission-catalog.ts's TOGGLEABLE_MODULES -- duplicated as a
// plain string union rather than importing cross-app.
export type ToggleableModule = "library" | "transport" | "houses" | "id_cards" | "payroll" | "expenses" | "leave";

export const TOGGLEABLE_MODULES: readonly ToggleableModule[] = [
  "library",
  "transport",
  "houses",
  "id_cards",
  "payroll",
  "expenses",
  "leave",
];

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
