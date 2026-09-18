-- Up Migration

-- FORCE ROW LEVEL SECURITY (previous migration) closed the RLS gap for the
-- schema-owning role on every table, but it also broke the one genuinely
-- tenant-less query in the app: DbService.queryUnscoped, used by
-- AuthService.login to find a user by email before any tenant context is
-- known. Without this, that query now evaluates
-- `tenant_id = current_setting('app.tenant_id', true)` against an unset
-- setting on every row and matches nothing -- login breaks entirely.
--
-- Fix: an additional, narrowly-scoped PERMISSIVE policy on `users` only,
-- for SELECT only, that grants visibility solely when a distinct session
-- flag is explicitly set. Postgres ORs multiple permissive policies
-- together for the same command, so this only ever widens access beyond
-- tenant_isolation's normal per-tenant scoping when that flag is present --
-- and DbService.queryUnscoped is the only code path that ever sets it, set
-- transaction-locally so it can never leak onto the next caller reusing the
-- same pooled connection. Every other table, and every other command on
-- `users`, is untouched.
CREATE POLICY users_unscoped_login_lookup ON public.users
  FOR SELECT
  USING (current_setting('app.unscoped_login_lookup', true) = 'true');

-- Down Migration

DROP POLICY users_unscoped_login_lookup ON public.users;
