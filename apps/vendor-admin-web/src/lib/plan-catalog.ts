// Duplicated from apps/cloud-api/src/common/plan-catalog.ts (that copy is
// the source of truth). Only needed here to label limits/plan tiers in
// the UI -- no enforcement happens client-side.
export const PLAN_TIERS = ["trial", "silver", "gold"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export interface PlanLimits {
  max_branches: number;
  max_super_admins: number;
  max_branch_admins: number;
  max_students: number;
  max_staff: number;
}

const GOLD_LIMITS: PlanLimits = {
  max_branches: 5,
  max_super_admins: 2,
  max_branch_admins: 10,
  max_students: 2000,
  max_staff: 200,
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  trial: GOLD_LIMITS,
  silver: {
    max_branches: 1,
    max_super_admins: 1,
    max_branch_admins: 2,
    max_students: 300,
    max_staff: 30,
  },
  gold: GOLD_LIMITS,
};
