import pg from "pg";

const { Pool } = pg;

// One pool for the whole process, matching how PrismaService's single
// PrismaClient instance was shared via Nest's @Global() DI before it.
//
// Deliberately a SEPARATE connection string from Prisma's DATABASE_URL
// while this migration is in progress: DATABASE_URL still connects as the
// schema-owning `vidyalaya` role for every not-yet-converted Prisma module
// (RLS policies never apply to a table's owner), while APP_DATABASE_URL
// connects as the restricted `vidyalaya_app` role, which IS subject to RLS
// -- so every query run through DbService gets real, enforced tenant
// isolation immediately, without disturbing modules still on Prisma. Once
// every module is converted (see the cutover batch), APP_DATABASE_URL
// becomes the only connection string the app needs.
export const pgPool = new Pool({ connectionString: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL });

// A second pool connecting as the schema-owning `vidyalaya` role, which RLS
// never restricts (no FORCE) -- reserved for the one class of query that is
// genuinely, legitimately tenant-less: resolving which tenant a request
// belongs to in the first place (e.g. login-by-email, before any JWT/tenant
// context exists yet). See DbService.queryUnscoped. Not a general escape
// hatch -- everything that already knows its tenantId uses the normal
// RLS-enforced pgPool above.
export const pgOwnerPool = new Pool({ connectionString: process.env.DATABASE_URL });
