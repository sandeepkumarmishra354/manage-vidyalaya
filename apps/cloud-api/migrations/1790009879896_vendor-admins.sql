-- Up Migration

-- Login table for the new vendor-admin app (apps/vendor-admin-api),
-- which manages tenants' plan tiers cross-tenant. Lives in this same
-- schema/migration runner (the only one this monorepo has) even though
-- only vendor-admin-api ever reads or writes it -- it connects with the
-- schema-owning role (same as scripts/create-tenant.ts), not the
-- RLS-bound vidyalaya_app role cloud-api uses, since a cross-tenant admin
-- surface can't be served by a per-request RLS session variable. No RLS
-- here: this table isn't tenant data, it's the vendor's own operator list.
CREATE TABLE public.vendor_admins (
    id text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    created_at timestamp(3) without time zone NOT NULL DEFAULT now()
);

ALTER TABLE ONLY public.vendor_admins
    ADD CONSTRAINT vendor_admins_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX vendor_admins_email_key ON public.vendor_admins USING btree (email);

-- Down Migration

DROP TABLE public.vendor_admins;
