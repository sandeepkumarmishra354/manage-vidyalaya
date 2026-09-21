-- Up Migration

-- Licensing/subscription-plan system: each tenant (school) is now on a plan
-- tier (trial/silver/gold) that caps branch count, admin-seat counts,
-- student/staff headcount, and which optional modules are available (see
-- apps/cloud-api/src/common/plan-catalog.ts for the per-tier limits).
-- subscription_expires_at (already existed, previously unused anywhere) is
-- reused as the paid-plan (silver/gold) expiry date -- NULL means
-- open-ended, used below for every currently-existing tenant.
ALTER TABLE public.tenants
  ADD COLUMN plan_tier text DEFAULT 'trial'::text NOT NULL,
  ADD COLUMN trial_ends_at timestamp(3) without time zone,
  ADD COLUMN is_suspended boolean DEFAULT false NOT NULL;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_plan_tier_check CHECK (plan_tier IN ('trial', 'silver', 'gold'));

-- Grandfather every tenant that already exists to unlimited Gold access
-- with no forced expiry, so this migration can never lock out a tenant
-- that was already working before plan enforcement existed. The vendor
-- assigns real tiers to these going forward via the vendor-admin app.
UPDATE public.tenants SET plan_tier = 'gold', trial_ends_at = NULL, subscription_expires_at = NULL, is_suspended = false;

-- Down Migration

ALTER TABLE public.tenants
  DROP CONSTRAINT tenants_plan_tier_check;

ALTER TABLE public.tenants
  DROP COLUMN plan_tier,
  DROP COLUMN trial_ends_at,
  DROP COLUMN is_suspended;
