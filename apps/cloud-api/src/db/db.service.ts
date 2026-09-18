import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { pgPool } from "./pg-pool.js";

// Replaces PrismaService as the thing every service depends on. Every
// statement runs inside its own (or an inherited) transaction so that
// `SELECT set_config('app.tenant_id', $1, true)` -- the session variable
// the RLS policies key off -- is always transaction-scoped: it's reset
// automatically when the transaction ends, so it can never leak onto the
// next caller that borrows the same pooled connection.
@Injectable()
export class DbService implements OnModuleDestroy {
  async onModuleDestroy() {
    await pgPool.end();
  }

  async withTransaction<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
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

  async query<T extends QueryResultRow>(tenantId: string, text: string, params: unknown[] = []): Promise<T[]> {
    return this.withTransaction(tenantId, async (client) => {
      const result = await client.query<T>(text, params);
      return result.rows;
    });
  }

  async queryOne<T extends QueryResultRow>(tenantId: string, text: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(tenantId, text, params);
    return rows[0] ?? null;
  }

  // Escape hatch for genuinely tenant-less queries (pre-login tenant
  // resolution, lookups against the `tenants` table itself, which has no
  // tenant_id column / RLS policy of its own). With no app.tenant_id set,
  // every RLS-protected table returns zero rows rather than every tenant's
  // rows -- this fails closed, not open -- but it's still a deliberately
  // named, grep-able exception to "every query is tenant-scoped", so use
  // it only where there is genuinely no tenant to scope to yet.
  async queryUnscoped<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
    const result = await pgPool.query<T>(text, params);
    return result.rows;
  }
}
