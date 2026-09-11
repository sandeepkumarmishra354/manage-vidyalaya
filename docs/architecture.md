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

**Fixed**: academic structure (academic sessions, classes, sections) used to
be seeded locally per device with no outbox entry at all, so it silently
never reached the cloud or a second device -- and there was no command to
create more of it beyond the one seeded demo class. Both are fixed:
`create_academic_session` / `create_class` / `create_section`
(`apps/desktop/src-tauri/src/commands/branches.rs`) now exist and go
through the same transaction-plus-outbox-entry path as every other mutation
(exercised in `tests/sync_integration.rs`'s
`class_created_on_one_device_reaches_another_via_sync`), and
`seed_demo_data_if_empty` uses that same path for its bootstrap rows instead
of a separate no-sync code path.

One simplification remains, deliberately: the seeded demo branch/session/
class/section still use fixed well-known ids (rather than random ones)
specifically because `seed_demo_data_if_empty` runs independently on every
device's first launch, before it has ever logged in -- if each device
generated random ids for "Main Campus" and its default class, two devices
for the same real school would each push their own copy and the tenant
would end up with duplicate branches. Fixed ids mean every device's
bootstrap produces byte-identical rows, so no duplication happens even
without a real provisioning flow yet. Once that flow exists (see
`docs/production-readiness.md`), a device's first run should pull its
tenant's real branch/academic structure from the server on login instead of
self-seeding at all, and `seed_demo_data_if_empty` becomes a pure
offline-demo/dev convenience rather than something a real deployment relies
on. See the comment on `DEMO_TENANT_ID` in
`apps/desktop/src-tauri/src/seed.rs` for the full reasoning.

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

`packages/db-schema/migrations/` is the source of truth, applied to SQLite
by the Rust migration runner (`apps/desktop/src-tauri/src/db.rs`) at app
startup, in order:

- `0001_core.sql`: tenants, branches, users/roles/user_roles,
  academic_sessions, classes, sections, students, guardians,
  student_guardians, admissions
- `0002_attendance.sql`: `attendance_records` (one row per student per day,
  enforced by a unique index -- re-marking a date updates it rather than
  duplicating)
- `0003_fees.sql`: `fee_structures` (what's charged), `fee_invoices` (what a
  student owes for a structure in a session), `fee_payments` (money
  actually received, possibly in installments). Amounts are stored in
  **minor units (paise)** as integers throughout -- never floats -- to
  avoid rounding errors on money.
- `0004_exams.sql`: `subjects`, `exams`, `exam_marks` (one row per
  student/subject/exam; a report card is a query, not a stored document)
- `0005_module_settings.sql`: `module_settings`, one row per (branch,
  module) that's been explicitly toggled. A module with no row defaults to
  enabled -- see "Module toggles" below.
- `0006_houses.sql`: `houses`, `student_houses` (a student's current house,
  one at a time), `house_point_events` (an append-only points ledger --
  never updated in place, so a leaderboard is just `SUM(points) GROUP BY
  house_id` and every award/deduction keeps an audit trail)
- `0007_library.sql`: `library_books` (with a denormalized
  `available_copies`, kept in sync by issue/return the same way
  `fee_invoices.amount_paid` is), `library_issues`
- `0008_transport.sql`: `transport_routes`, `transport_stops`,
  `student_transport` (a student's current route/stop, one at a time)

Plus local-only (desktop-only, never synced) tables under
`apps/desktop/src-tauri/migrations/`: `app_settings` (cached session/token),
`sync_outbox`, `sync_state`.

The Postgres schema (`apps/cloud-api/prisma/schema.prisma`) mirrors only the
tenant/branch/role/user subset by hand -- see the design note at the top of
that file for why it isn't code-generated from the same source, and why the
rest (students, attendance, fees, exams, ...) lives server-side only inside
the `sync_log` change feed rather than as relational Postgres tables.

Every mutating command follows the same shape: a thin `#[tauri::command]`
wrapper that locks the connection, plus a `..._impl(conn, input)` function
with the actual logic, so it can be exercised directly from integration
tests without a running Tauri app (see
`apps/desktop/src-tauri/tests/modules_integration.rs`). Outbox rows are
written via `state::enqueue_outbox_from_row`, which re-reads the row that
was just written rather than requiring every command to hand-build a JSON
payload that has to be kept in sync with the table's columns by hand.

## Admissions & eligibility

`create_admission` leaves a student at `status = 'applied'` -- an applicant,
not yet a student the rest of the system should treat as real. A separate
`confirm_admission` command (`apps/desktop/src-tauri/src/commands/
students.rs`) is what a front-desk admin clicks to actually enroll them: it
assigns a branch+year-scoped sequential admission number
(`MAIN-2026-0001`, with a bounded retry loop against the `UNIQUE
(tenant_id, admission_number)` constraint to absorb same-device races) and
flips the student to `enrolled`. Attendance rosters, fee invoice
generation, and exam marks rosters all filter on `status = 'enrolled'`, so
an unconfirmed applicant simply doesn't show up in any of them -- there's
no separate "eligibility" flag to keep in sync, `status` already carries
that meaning. A true cross-device numbering race (two offline devices
confirming admissions for the same branch before either has synced) isn't
fully solved -- see the last-write-wins note above; the retry loop only
covers same-device races.

## Module toggles

Every module beyond the core (students/admissions, academic setup,
dashboard) can be turned off per branch via `module_settings`
(`get_module_settings` / `set_module_enabled` in `apps/desktop/src-tauri/
src/commands/module_settings.rs`, `TOGGLEABLE_MODULES` in `models.rs`).
The frontend (`stores/app-store.ts`) loads a branch's disabled-module set
on login/branch-switch and uses it two ways: to filter which nav sections
render (`components/app-shell.tsx`), and as a `RequireModule` route guard
(`App.tsx`) that redirects to the dashboard if a disabled module's route is
reached directly by URL -- so hiding a nav item isn't the only thing
standing between a user and a module a school turned off. Disabling a
module never touches its data; toggling it back on picks up right where it
left off.

## Print output

Attendance registers, exam report cards, and ID cards are printed
client-side via `window.print()` against a small print stylesheet
(`index.css`): everything on the page is hidden except an element marked
`data-print-area` (and its descendants), so each printable view renders its
own clean, chrome-free layout in the same DOM rather than opening a
separate window or generating a PDF server-side.
