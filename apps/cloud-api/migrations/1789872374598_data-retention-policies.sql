-- Up Migration

-- DPDP (India's Digital Personal Data Protection Act, 2023) requires
-- erasing personal data once its purpose is served -- there is currently
-- no retention or erasure mechanism anywhere in this schema. This adds a
-- per-tenant, per-category configurable retention policy (read by the new
-- RetentionModule and by scripts/run-retention.ts) plus an explicit,
-- auditable "already anonymized" marker on the three tables the V1 sweep
-- (student/staff identity only -- see docs/production-readiness.md) can
-- touch. No branch_id: retention is a school-group-wide compliance
-- policy, not a per-branch setting like module_settings.

CREATE TABLE public.retention_policies (
    id text NOT NULL,
    tenant_id text NOT NULL,
    category text NOT NULL,
    retention_years integer NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.retention_policies ADD CONSTRAINT retention_policies_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX retention_policies_tenant_id_category_key
  ON public.retention_policies USING btree (tenant_id, category)
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.retention_policies TO vidyalaya_app;

ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.retention_policies
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
ALTER TABLE public.retention_policies FORCE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON public.retention_policies;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.retention_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Explicit marker rather than inferring "already swept" from redacted
-- field values -- crisper for the eligibility query, and gives an
-- auditable timestamp of when each record was anonymized.
ALTER TABLE public.students ADD COLUMN anonymized_at timestamp(3) without time zone;
ALTER TABLE public.staff ADD COLUMN anonymized_at timestamp(3) without time zone;
ALTER TABLE public.guardians ADD COLUMN anonymized_at timestamp(3) without time zone;

-- Down Migration

ALTER TABLE public.guardians DROP COLUMN anonymized_at;
ALTER TABLE public.staff DROP COLUMN anonymized_at;
ALTER TABLE public.students DROP COLUMN anonymized_at;

DROP TRIGGER IF EXISTS set_updated_at ON public.retention_policies;
DROP POLICY tenant_isolation ON public.retention_policies;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.retention_policies FROM vidyalaya_app;
DROP TABLE public.retention_policies;
