# Architecture

## Decisions

- **Local storage + sync**: SQLite on-device (via `rusqlite`, not a plugin,
  so the sync engine can own transactional logic directly) with a custom
  outbox/changelog sync layer. Full control, debuggable, no vendor lock-in.
- **Tenancy**: one school (customer) = one tenant, with many branches
  underneath sharing the same dataset, each record tagged with a
  `branch_id`. Every syncable row also carries `tenant_id` so real
  multi-school SaaS is possible later without a schema rewrite.
- **Business model**: subscription SaaS (per branch/student) -- cloud sync,
  backups, and centralized updates are core product value.
- **Frontend**: React + TypeScript + Tailwind + shadcn/ui inside Tauri v2.
- **Cloud backend**: NestJS + PostgreSQL (via Prisma), exposing auth and the
  sync push/pull API.

## Sync engine

**Outbox pattern**: every local write (insert/update/delete) is wrapped in a
SQLite transaction that also inserts a row into `sync_outbox` (entity
table/id, op, full row snapshot, client timestamp). A background Rust task
(and a manual "sync now" trigger) then:

1. **Push**: sends unsent `sync_outbox` rows to `POST /sync/push` in
   batches, in order.
2. **Pull**: requests changes since the local `last_pulled_server_seq`
   cursor from `GET /sync/pull`, applies them locally inside a transaction.

**Server storage (v1 scope)**: cloud-api does *not* keep a full relational
mirror of every synced entity (students, guardians, admissions, classes...).
Instead it keeps an append-only per-tenant change log (`sync_log`), and a
new device's first pull replays the entire log in order, which reconstructs
current state (later rows for the same entity id overwrite earlier ones via
the desktop's `INSERT OR REPLACE`). `tenants` / `branches` / `roles` /
`users` *are* modeled relationally server-side because cloud-api needs to
query them directly for auth and billing. A queryable relational mirror for
a future web/reporting portal is intentionally deferred.

**Conflict resolution**: last-write-wins using each row's `version`/
`updated_at`. This is a documented v1 limitation -- concurrent edits of the
*same* record from two offline devices aren't merged field-by-field. Upgrade
path if that becomes common: per-field merge or CRDTs.

**Known gap**: academic structure (academic sessions, classes, sections) is
currently seeded locally per device with fixed demo ids rather than synced
through the outbox like students/guardians/admissions are. Real per-school
academic structure provisioning (created once, pushed through the outbox
like everything else) is part of the Fees/Attendance/Exams build-out, not
this milestone. See comments in `apps/desktop/src-tauri/src/seed.rs`.

## Auth & licensing

Cloud-api issues JWTs per staff user (roles: `super_admin`, `branch_admin`,
`accountant`, `teacher`, `front_desk`). The desktop app caches the access
token and a signed entitlement (licensed branches, subscription status,
expiry) locally on login, so the app can restore the session and keep
working **fully offline** afterwards -- no re-login required until the
cached entitlement's expiry (a configurable offline grace period,
`ENTITLEMENT_OFFLINE_GRACE_DAYS`, default 14 days).

Not yet implemented: a `/auth/refresh` endpoint (re-login stands in for it
in v1) and real school signup/provisioning (tenants are currently created
via `prisma/seed.ts` with fixed demo ids for local development).

## Data model

Defined once in `packages/db-schema/migrations/0001_core.sql`: tenants,
branches, users/roles/user_roles, academic_sessions, classes, sections,
students, guardians, student_guardians, admissions, plus local-only sync
bookkeeping tables (`sync_outbox`, `sync_state`). Applied to SQLite by the
Rust migration runner (`apps/desktop/src-tauri/src/db.rs`) at app startup.
The Postgres schema (`apps/cloud-api/prisma/schema.prisma`) mirrors the
tenant/branch/role/user subset by hand -- see the design note at the top of
that file for why it isn't code-generated from the same source.

Fees, Attendance, and Exams get their own migrations (`0002_*` etc.) when
those modules are built.
