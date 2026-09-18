import { randomUUID } from "node:crypto";

import { NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";

// Thin shared helpers for the repeated tenant-scoped CRUD shapes -- still
// plain parameterized SQL under the hood, just enough structure that the
// `tenant_id` predicate can't be forgotten by accident. Anything beyond
// simple by-id/by-filter CRUD (joins, aggregates, business-logic queries)
// is hand-written SQL via `client.query(...)` directly in the service, but
// must always include its own `tenant_id = $N` -- RLS (see the migration
// that enables it) is the backstop for a query that forgets, not a
// replacement for writing the filter.
//
// `table`/column names passed in below are always literal strings from our
// own call sites, never user input -- safe to interpolate. Every actual
// value is passed as a parameterized placeholder, never interpolated.

export interface TenantRow {
  id: string;
  tenant_id: string;
  [key: string]: unknown;
}

export async function findOneForTenant<T extends TenantRow>(
  client: PoolClient,
  table: string,
  tenantId: string,
  id: string,
): Promise<T | null> {
  const result = await client.query<T>(
    `SELECT * FROM ${table} WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId],
  );
  return result.rows[0] ?? null;
}

export async function findManyForTenant<T extends TenantRow>(
  client: PoolClient,
  table: string,
  tenantId: string,
  where: Record<string, unknown> = {},
  orderBy?: string,
): Promise<T[]> {
  const conditions = ["tenant_id = $1", "deleted_at IS NULL"];
  const values: unknown[] = [tenantId];
  for (const [column, value] of Object.entries(where)) {
    values.push(value);
    conditions.push(`${column} = $${values.length}`);
  }
  const orderClause = orderBy ? ` ORDER BY ${orderBy}` : "";
  const result = await client.query<T>(`SELECT * FROM ${table} WHERE ${conditions.join(" AND ")}${orderClause}`, values);
  return result.rows;
}

// Every table's `id` column is an app-generated UUID with no DB-side
// default (matching this codebase's Prisma-era convention of `randomUUID()`
// at the call site) -- auto-filling it here unless the caller already
// supplied one means every insertRow call site can't forget it.
export async function insertRow<T extends TenantRow>(
  client: PoolClient,
  table: string,
  tenantId: string,
  data: Record<string, unknown>,
): Promise<T> {
  const withId = data.id === undefined ? { id: randomUUID(), ...data } : data;
  const columns = ["tenant_id", ...Object.keys(withId)];
  const values: unknown[] = [tenantId, ...Object.values(withId)];
  const placeholders = values.map((_, i) => `$${i + 1}`);
  const result = await client.query<T>(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    values,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`insert into ${table} returned no row`);
  }
  return row;
}

// Bumps `version` itself (matching the existing manual-optimistic-locking
// convention) -- callers pass every other changed column in `data`.
export async function updateRow<T extends TenantRow>(
  client: PoolClient,
  table: string,
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
): Promise<T> {
  const columns = Object.keys(data);
  const values: unknown[] = Object.values(data);
  const setClauses = columns.map((col, i) => `${col} = $${i + 1}`);
  setClauses.push("version = version + 1");
  values.push(id, tenantId);
  const result = await client.query<T>(
    `UPDATE ${table} SET ${setClauses.join(", ")} WHERE id = $${values.length - 1} AND tenant_id = $${values.length} AND deleted_at IS NULL RETURNING *`,
    values,
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundException(`${table} row ${id} not found`);
  }
  return row;
}

export async function softDeleteRow<T extends TenantRow>(
  client: PoolClient,
  table: string,
  tenantId: string,
  id: string,
  updatedBy: string,
): Promise<T> {
  return updateRow<T>(client, table, tenantId, id, {
    deleted_at: new Date(),
    updated_at: new Date(),
    updated_by: updatedBy,
  });
}
