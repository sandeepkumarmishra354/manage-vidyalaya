import pg from "pg";

const { Pool } = pg;

// This app is inherently cross-tenant (list every tenant's usage, edit any
// tenant's plan) -- something the RLS-bound `vidyalaya_app` role
// structurally can't serve, since its policies are keyed off a single
// current_setting('app.tenant_id') per query. So it connects with the
// schema-owning role instead, same as scripts/create-tenant.ts -- RLS
// never applies to a table's owner.
export const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
