import pg from "pg";

const { Pool } = pg;

// One pool for the whole process, shared via Nest's @Global() DbModule.
//
// Connects as the restricted `vidyalaya_app` role, which IS subject to Row-
// Level Security (unlike the schema-owning `vidyalaya` role behind
// DATABASE_URL/pgOwnerPool below, which RLS policies never apply to) -- so
// every query run through DbService gets real, database-enforced tenant
// isolation as a backstop behind the application-level tenant_id filtering.
export const pgPool = new Pool({ connectionString: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL });

// A second pool connecting as the schema-owning `vidyalaya` role, which RLS
// never restricts (no FORCE) -- reserved for the one class of query that is
// genuinely, legitimately tenant-less: resolving which tenant a request
// belongs to in the first place (e.g. login-by-email, before any JWT/tenant
// context exists yet). See DbService.queryUnscoped. Not a general escape
// hatch -- everything that already knows its tenantId uses the normal
// RLS-enforced pgPool above.
export const pgOwnerPool = new Pool({ connectionString: process.env.DATABASE_URL });
