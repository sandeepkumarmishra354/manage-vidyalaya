import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { pgPool } from "./pg-pool.js";

// Every tenant-scoped table (branches, users, roles, students, staff, ...)
// has FORCE ROW LEVEL SECURITY applied (see cloud-api's
// force-row-level-security.sql) -- that makes RLS apply even to this
// app's schema-owning connection, not just the RLS-bound vidyalaya_app
// role cloud-api uses. Only `tenants` and `vendor_admins` have no RLS at
// all (confirmed: no tenant_id column on either). So every query that
// touches a tenant-scoped table -- even from this "cross-tenant" app --
// still needs `app.tenant_id` set to the one tenant it's reading/writing,
// exactly like cloud-api's own DbService. There is no way to read
// literally all tenants' data in one unscoped query; cross-tenant views
// (e.g. TenantsService.listTenants' usage counts) loop per tenant instead.
@Injectable()
export class DbService implements OnModuleDestroy {
  async onModuleDestroy() {
    await pgPool.end();
  }

  // For `tenants`/`vendor_admins` only -- anything else will return zero
  // rows (FORCE RLS with no app.tenant_id set matches nothing) rather
  // than raising, which is easy to misuse silently. Use withTenant for
  // every other table.
  async query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
    const result = await pgPool.query<T>(text, params);
    return result.rows;
  }

  async queryOne<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // Scopes every statement inside `fn` to one tenant via the same
  // transaction-local `SELECT set_config('app.tenant_id', ...)` cloud-api's
  // DbService and scripts/create-tenant.ts use -- required for any query
  // against a FORCE-RLS table, even from this schema-owning connection.
  async withTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.withTransaction(async (client) => {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      return fn(client);
    });
  }
}
