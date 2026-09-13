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

Cloud-api issues JWTs per staff user, carrying the user's role *names* as
claims. The desktop app caches the access token and a signed entitlement
(licensed branches, subscription status, expiry) locally on login, so the
app can restore the session and keep working **fully offline** afterwards
-- no re-login required until the cached entitlement's expiry (a
configurable offline grace period, `ENTITLEMENT_OFFLINE_GRACE_DAYS`,
default 14 days).

Not yet implemented: a `/auth/refresh` endpoint (re-login stands in for it
in v1) and real school signup/provisioning (tenants are currently created
via `prisma/seed.ts` with fixed demo ids for local development).

## RBAC & permissions

Five system roles are seeded (`super_admin`, `branch_admin`, `accountant`,
`teacher`, `front_desk`, `is_system = 1`, undeletable), but roles are no
longer just labels: `role_permissions` grants each role a set of keys from
a hand-kept catalog (`PERMISSION_CATALOG` in
`apps/desktop/src-tauri/src/models.rs`, mirrored in
`apps/cloud-api/prisma/seed.ts` -- same "kept in sync by hand" convention
as `SYNCABLE_TABLES`/`TOGGLEABLE_MODULES`). Admins can create additional
custom roles and edit any role's permission grant from the Roles &
Permissions admin page.

**Enforcement**: `state::require_permission(conn, key)` -- reads the
current cached session's role *names*, joins to `role_permissions`, and
fails closed (no session, no matching role, or no grant all deny) -- is
called at the top of every sensitive Tauri command. Server-side,
`PermissionsGuard` (`apps/cloud-api/src/common/permissions.guard.ts`) does
the equivalent for the handful of endpoints that must live on the server
(see below), querying fresh from Postgres each request rather than
trusting the JWT's roles claim, since permissions can change after a token
was issued.

**Why `role_permissions` is relationally mirrored**: unlike most synced
tables (which live only in `sync_log`, see below), `role_permissions` is
also modeled as a first-class Prisma model, alongside the pre-existing
`tenants`/`branches`/`roles`/`users`/`user_roles` set -- because
`PermissionsGuard` needs to query it directly, independent of any desktop
device being online. `SyncService.mirrorRelationalTable`
(`apps/cloud-api/src/sync/sync.service.ts`) upserts into these relational
mirrors on every push to one of these specific tables, alongside the
regular `sync_log` write -- this is the same mechanism that keeps `users`/
`roles` themselves queryable server-side.

**The one thing that must go through the server**: creating a *login* (a
`users` row with a password) and resetting a password, since
`password_hash` is set server-side only -- the desktop app never computes
or holds one. `apps/cloud-api/src/users/` (`UsersService`) handles both,
permission-gated behind `users.manage`; everything else about a user or
role (profile fields, active/inactive, role assignment, custom
permissions) is a regular offline-capable synced write, same as any other
entity.

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
- `0009_rbac.sql`: `role_permissions` (grants of a `permission_key` to a
  role); adds `is_system`/`deleted_at` to `roles` (the latter predates the
  soft-delete convention used everywhere else -- added here now that roles
  can be deleted)
- `0010_staff.sql`: `staff` (employee/HR record, separate from `users` --
  not every staff member has a login); adds
  `sections.class_teacher_staff_id` (the correct FK target for "who is the
  class teacher" -- the original `class_teacher_id -> users` column from
  `0001_core.sql` was never used anywhere and is left as dead weight)
- `0011_teacher_assignments.sql`: `teacher_subject_assignments` (which
  staff member teaches which subject to which class/section in a session)
- `0012_staff_attendance.sql`: `staff_attendance`, mirroring
  `attendance_records` for staff instead of students -- feeds payroll's
  loss-of-pay computation
- `0013_payroll.sql`: `salary_structures` + `salary_components`
  (component-based: fixed or % of basic), `payroll_runs`, `payslips`,
  `payslip_line_items`
- `0014_promotion.sql`: `student_enrollments` (historical per-session
  class/section, since `students.current_class_id` is a single mutable
  pointer with no history otherwise), `promotion_batches` +
  `promotion_batch_items` (a reviewable, executable batch of per-student
  promote/retain/withdraw decisions)
- `0015_exam_backpaper.sql`: adds `exam_type`/`parent_exam_id`/
  `passing_percentage` to `exams` -- a back-paper exam is just another
  `exams` row linked back to the original, no change to `exam_marks`
- `0016_audit_log.sql`: `audit_log`, a generic append-only trail (see
  "Audit log" below)

Plus local-only (desktop-only, never synced) tables under
`apps/desktop/src-tauri/migrations/`: `app_settings` (cached session/token),
`sync_outbox`, `sync_state`.

The Postgres schema (`apps/cloud-api/prisma/schema.prisma`) mirrors only the
tenant/branch/role/user/user_role/role_permission subset by hand -- see the
design note at the top of that file for why it isn't code-generated from
the same source, and why the rest (students, attendance, fees, exams,
staff, payroll, ...) lives server-side only inside the `sync_log` change
feed rather than as relational Postgres tables.

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

## Staff, payroll, and session promotion

**Staff/HR** (`commands/staff.rs`) is a full employee record, separate from
`users` (login identity) on purpose -- not every staff member needs or gets
a login (a driver, a peon). `create_staff_login`/`reset_staff_password`
(`commands/rbac.rs`) are the two operations that call cloud-api (see RBAC
section above); everything else about a staff member, including
class-teacher and subject-teacher assignment
(`teacher_subject_assignments`, `sections.class_teacher_staff_id`), is a
regular local write.

**Payroll** (`commands/payroll.rs`) is deliberately scoped: a
component-based salary structure (fixed amount or % of basic per
component) plus a monthly `generate_payroll_run` that computes
loss-of-pay automatically from `staff_attendance` (`present` = full paid
day, `half_day` = half paid/half LOP, `absent` = full LOP, proportional to
`gross_before_lop / days_in_month`) and writes one payslip + line items
per staff member with a structure configured. **What it explicitly does
not do**: compute PF/ESI/Professional-Tax/TDS against government slabs --
those are manual deduction components on the salary structure, since
statutory tax rules change yearly and deserve dedicated compliance
tooling, not a bolt-on. Staff still capture PF/ESI/UAN/PAN/bank fields as
plain data for record-keeping and payslip printing.

**Session promotion** (`commands/promotion.rs`) solves the fact that
`students.current_class_id` was a single mutable pointer with no history:
`student_enrollments` now records a student's class/section for every
session they were promoted/retained into, and a `promotion_batches` +
`promotion_batch_items` flow lets an admin review a suggested class
mapping (matched by `sort_order + 1`, i.e. "the next class up", not by
name) and override individual students' decisions (promote to a specific
class, retain, or withdraw) before executing the batch transactionally.
One `audit_log` row covers the whole batch rather than one per student, to
keep the trail scannable.

## Audit log

`audit_log` is a generic, append-only trail -- `audit::record_audit`
writes one row inside the same transaction as the mutation it describes
(same "impossible to lose a row without losing the write" shape as
`state::enqueue_outbox`), called from every create/update/delete/
status-change across the command layer. It's synced like any other table,
so the trail is visible from any device once synced, and it never produces
`update`/`delete` ops against itself -- once written, an entry is
permanent. `commands::audit::list_audit_log` (filterable by entity table,
actor, and date range) backs the Audit Log admin page.

## Edit and delete

Every entity that used to be create-only (students, guardians, classes,
sections, academic sessions, fee structures, invoices, payments, subjects,
exams, houses, library books, transport routes/stops, roles) now has
`update_*` and, where deletion makes sense, `delete_*`/status-change
commands, following the same transactional shape as every create command:
bump `version`, set `updated_at`/`updated_by`, write to `sync_outbox`, call
`record_audit`. Deletions are soft (`deleted_at`) except where a hard
delete is harmless (e.g. removing a not-yet-executed promotion batch item);
money-adjacent actions (invoices, payments) use an explicit
void/reversal record rather than deleting history.

## Print output

Attendance registers, exam report cards, ID cards, and payslips are printed
client-side via `window.print()` against a small print stylesheet
(`index.css`): everything on the page is hidden except an element marked
`data-print-area` (and its descendants), so each printable view renders its
own clean, chrome-free layout in the same DOM rather than opening a
separate window or generating a PDF server-side.
