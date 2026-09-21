-- Up Migration

-- Custom role creation/editing is being removed entirely (RolesController
-- now only exposes GET) -- every tenant is limited to the fixed catalog of
-- 5 system role names, each with its canonical, server-defined permission
-- set (permission-catalog.ts's SYSTEM_ROLE_PERMISSIONS). This makes
-- super_admin/branch_admin headcount limits trivially enforceable by
-- counting roles.name directly, with no way to spoof the count via a
-- renamed/cloned role.
--
-- NOT VALID is deliberate: it skips validating existing rows, so a
-- tenant that already has a custom-named role (e.g. dev/demo data) isn't
-- broken by this migration -- that row is grandfathered, left alone, not
-- deleted. The check still applies to every future INSERT/UPDATE, and
-- since Postgres re-checks the whole row on any UPDATE, a grandfathered
-- custom-named role becomes fully immutable at the DB layer too (harmless,
-- since the write endpoints that could touch it no longer exist).
ALTER TABLE public.roles
  ADD CONSTRAINT roles_name_fixed_catalog CHECK (
    name IN ('super_admin', 'branch_admin', 'accountant', 'teacher', 'front_desk')
  ) NOT VALID;

-- Down Migration

ALTER TABLE public.roles
  DROP CONSTRAINT roles_name_fixed_catalog;
