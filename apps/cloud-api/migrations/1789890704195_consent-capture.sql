-- Up Migration

-- DPDP requires informed, specific consent before processing personal
-- data -- for a minor (every student), verifiable guardian consent
-- specifically. This adds a required, timestamped consent record to the
-- two data-collection entry points: admission (guardian consents on the
-- student's behalf) and staff onboarding (the staff member consents for
-- themselves). Columns live directly on the row they protect rather than
-- a separate table -- each one is a single point-in-time event tied to
-- exactly one admission/staff row, and a snapshot text field is more
-- correct here than a live guardian_id FK, since the record must reflect
-- what was true *at the moment of consent*, not drift if the guardian's
-- name is edited later. Existing rows default to consent_given = false,
-- which is factually correct -- they predate this feature and must never
-- be backfilled to true.

ALTER TABLE public.admissions
  ADD COLUMN consent_given boolean DEFAULT false NOT NULL,
  ADD COLUMN consent_given_at timestamp(3) without time zone,
  ADD COLUMN consent_given_by_name text,
  ADD COLUMN consent_given_by_relation text,
  ADD COLUMN consent_version text;

ALTER TABLE public.staff
  ADD COLUMN consent_given boolean DEFAULT false NOT NULL,
  ADD COLUMN consent_given_at timestamp(3) without time zone,
  ADD COLUMN consent_version text;

-- Down Migration

ALTER TABLE public.staff
  DROP COLUMN consent_version,
  DROP COLUMN consent_given_at,
  DROP COLUMN consent_given;

ALTER TABLE public.admissions
  DROP COLUMN consent_version,
  DROP COLUMN consent_given_by_relation,
  DROP COLUMN consent_given_by_name,
  DROP COLUMN consent_given_at,
  DROP COLUMN consent_given;
