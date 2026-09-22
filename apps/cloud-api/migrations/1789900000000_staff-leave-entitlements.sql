-- Up Migration

-- Staff leave entitlement: a school can optionally define named leave
-- types (Casual, Sick, ...) with a monthly-accrual quota that varies by
-- staff category. Quota tracking is opt-in per leave type (quota_enabled)
-- -- a type with it off behaves exactly like today's leave requests
-- (freely approvable, always fully paid). Two new tables, plus a
-- leave_type_id / paid_days / unpaid_days extension on
-- staff_leave_requests so an approved request can record how many of its
-- days were within entitlement (paid) vs. beyond it (unpaid/LOP) --
-- populated only for quota_enabled types, left NULL otherwise.

CREATE TABLE public.leave_types (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    quota_enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.leave_types ADD CONSTRAINT leave_types_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX leave_types_tenant_id_name_key
  ON public.leave_types USING btree (tenant_id, name)
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_types TO vidyalaya_app;

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.leave_types
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
ALTER TABLE public.leave_types FORCE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON public.leave_types;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.leave_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- One row per (leave type, staff category); a NULL staff_category_id row
-- is the fallback quota for a category with no row of its own (including
-- staff with no category assigned at all).
CREATE TABLE public.leave_type_quotas (
    id text NOT NULL,
    tenant_id text NOT NULL,
    leave_type_id text NOT NULL,
    staff_category_id text,
    monthly_accrual_days numeric(4,2) NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text,
    deleted_at timestamp(3) without time zone,
    version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.leave_type_quotas ADD CONSTRAINT leave_type_quotas_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX leave_type_quotas_tenant_id_type_category_key
  ON public.leave_type_quotas USING btree (tenant_id, leave_type_id, COALESCE(staff_category_id, ''))
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_type_quotas TO vidyalaya_app;

ALTER TABLE public.leave_type_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.leave_type_quotas
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
ALTER TABLE public.leave_type_quotas FORCE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON public.leave_type_quotas;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.leave_type_quotas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.staff_leave_requests ADD COLUMN leave_type_id text;
ALTER TABLE public.staff_leave_requests ADD COLUMN paid_days numeric(4,2);
ALTER TABLE public.staff_leave_requests ADD COLUMN unpaid_days numeric(4,2);

-- Down Migration

ALTER TABLE public.staff_leave_requests DROP COLUMN unpaid_days;
ALTER TABLE public.staff_leave_requests DROP COLUMN paid_days;
ALTER TABLE public.staff_leave_requests DROP COLUMN leave_type_id;

DROP TRIGGER IF EXISTS set_updated_at ON public.leave_type_quotas;
DROP POLICY tenant_isolation ON public.leave_type_quotas;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.leave_type_quotas FROM vidyalaya_app;
DROP TABLE public.leave_type_quotas;

DROP TRIGGER IF EXISTS set_updated_at ON public.leave_types;
DROP POLICY tenant_isolation ON public.leave_types;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.leave_types FROM vidyalaya_app;
DROP TABLE public.leave_types;
