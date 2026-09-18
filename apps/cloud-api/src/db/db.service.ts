import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { pgOwnerPool, pgPool } from "./pg-pool.js";

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
    await pgOwnerPool.end();
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

  // Escape hatch for genuinely tenant-less queries -- resolving which
  // tenant a request belongs to in the first place (e.g. login-by-email,
  // before any JWT/tenant context exists). Runs through pgOwnerPool (the
  // schema-owning role, which RLS never restricts) rather than the normal
  // RLS-enforced pool, precisely because the whole point is to search
  // across every tenant. This is NOT a general "skip RLS" escape hatch --
  // it's deliberately named and grep-able, and every other query in this
  // codebase that already knows its tenantId must use the scoped methods
  // above instead.
  async queryUnscoped<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
    const result = await pgOwnerPool.query<T>(text, params);
    return result.rows;
  }
}
