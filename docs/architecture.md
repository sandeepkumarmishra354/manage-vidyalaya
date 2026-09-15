# Architecture

## Decisions

- **Online-only**: no local database, no offline mode, no sync engine. The
  Tauri desktop app is a thin native shell around a React frontend that
  talks directly to cloud-api over HTTPS using plain browser `fetch()`.
  This is a deliberate pivot away from an earlier offline-first design
  (SQLite + outbox sync) -- see "Why not offline-first" below.
- **Tenancy**: one school (customer) = one tenant, with many branches
  underneath sharing the same dataset, each record tagged with a
  `branchId`. Every tenant-scoped row also carries `tenantId` so real
  multi-school SaaS works without a schema rewrite.
- **Business model**: subscription SaaS (per branch/student).
- **Frontend**: React + TypeScript + Tailwind + shadcn/ui inside Tauri v2,
  with `@tanstack/react-query` as the data-fetching/caching layer.
- **Cloud backend**: NestJS + PostgreSQL (via Prisma) is the entire system
  of record -- every domain entity is a real, relational Postgres table
  with full CRUD REST endpoints, not just auth/billing metadata.

### Why not offline-first

An earlier version of this app used SQLite-on-device with a custom
outbox/changelog sync engine, so staff could keep working during a
connectivity outage. That's been dropped: it roughly doubled the surface
area of every feature (a Rust command *and* a NestJS endpoint *and* a sync
reconciliation path for each entity), conflict resolution was last-write-
wins with no real merge story, and the schools this targets have reliable
enough connectivity that the offline case wasn't worth that cost. Cutting
it also lets Rust shrink to almost nothing (see "Desktop shell" below),
which was worth doing on its own.

## Desktop shell

`apps/desktop/src-tauri` is now the minimum Tauri needs to produce a native
window: `lib.rs` is just
`tauri::Builder::default().plugin(tauri_plugin_opener::init()).run(...)`,
with no managed state, no invoke handlers, and no commands. `Cargo.toml`
depends on only `tauri` and `tauri-plugin-opener` -- no SQLite driver, no
HTTP client, no async runtime; the frontend's own `fetch()` calls handle
all networking directly from the webview; that's possible because
`tauri.conf.json`'s CSP is `null` and cloud-api's CORS is unrestricted
(`app.enableCors()` with no origin allowlist).

`apps/desktop/src/lib/http.ts` is the one shared HTTP client: it attaches
`Authorization: Bearer <access_token>` from `localStorage`, retries once
after a single-flight token refresh on a 401, and throws a typed
`ApiError` on failure. `apps/desktop/src/lib/api.ts` wraps every cloud-api
route in a typed method on top of that client; page components call these
methods through React Query (`useQuery`/`useMutation`) rather than
`useEffect` + manual refetch.

## Auth

Cloud-api issues short-lived access JWTs and longer-lived refresh JWTs per
staff user (`POST /auth/login`), both carrying a `type: "access" |
"refresh"` discriminator so one can never be used in place of the other.
`JwtStrategy.validate()` rejects any token whose `type` isn't `"access"`.
`POST /auth/refresh` verifies a refresh token manually, re-derives the
user's current roles from Postgres (never trusting stale claims in the
token), and issues a new access token; the refresh token itself isn't
rotated. `GET /auth/me` returns the current session (user, roles, branches,
permissions, disabled modules) -- the frontend calls it once right after
login and caches the result in `stores/app-store.ts`. There's no offline
grace period or cached-entitlement concept: a session is only as good as
its ability to reach cloud-api right now.

## RBAC & permissions

Five system roles are seeded (`super_admin`, `branch_admin`, `accountant`,
`teacher`, `front_desk`, `isSystem = true`, undeletable), and admins can
create additional custom roles. `PERMISSION_CATALOG` in
`apps/cloud-api/src/common/permission-catalog.ts` is the single source of
truth for every permission key and which of them each system role gets by
default (`SYSTEM_ROLE_PERMISSIONS`) -- both `prisma/seed.ts` and the
`RolesModule` import it directly, so there's nothing to keep in sync by
hand anymore.

**Enforcement**: every controller is guarded with
`@UseGuards(JwtAuthGuard, PermissionsGuard)` and each mutating/sensitive
route carries `@RequirePermission('<catalog-key>')`. `PermissionsGuard`
(`apps/cloud-api/src/common/permissions.guard.ts`) queries
`UserRole` -> `RolePermission` fresh from Postgres on every request rather
than trusting the JWT's roles claim, since permissions can change after a
token was issued. `@CurrentUser()` (`JwtPayload { sub, tenantId, roles,
type }`) scopes every query to the acting user's tenant.

**Creating a login** (a `User` row with a password) and resetting a
password are the two operations that only ever make sense server-side,
since `passwordHash` is never computed or held client-side --
`apps/cloud-api/src/users/` (`UsersService`) handles both, permission-gated
behind `users.manage`.

## Data model

`apps/cloud-api/prisma/schema.prisma` is the single source of truth for
the schema -- there's no separate SQL migration set to keep in sync with it
(an earlier `packages/db-schema/` SQLite reference was deleted once every
table had a Prisma model). It has one model per domain entity, grouped
roughly the same way as the NestJS modules below:

- **Core**: `Tenant`, `Branch`, `Role`, `RolePermission`, `User`,
  `UserRole`
- **Academic**: `AcademicSession`, `Class`, `Section`
- **Students**: `Student`, `Guardian`, `StudentGuardian`, `Admission`
- **Attendance**: `AttendanceRecord` (one row per student per day, unique
  on student+date -- re-marking a date updates it rather than duplicating)
- **Fees**: `FeeStructure` (what's charged), `FeeInvoice` (what a student
  owes for a structure in a session), `FeePayment` (money actually
  received, possibly in installments). Amounts are integer **paise**
  throughout, never floats, to avoid rounding errors on money.
- **Exams**: `Subject`, `Exam` (with `examType`/`parentExamId` for
  back-paper exams -- just another `Exam` row linked to the original),
  `ExamMark` (one row per student/subject/exam; a report card is a query,
  not a stored document)
- **Houses**: `House`, `StudentHouse` (a student's current house, one at a
  time), `HousePointEvent` (an append-only points ledger -- a leaderboard
  is `SUM(points) GROUP BY houseId`, and every award/deduction keeps its
  own audit trail by never being updated in place)
- **Library**: `LibraryBook` (with a denormalized `availableCopies`, kept
  in sync by issue/return the same way `FeeInvoice.amountPaid` is),
  `LibraryIssue`
- **Transport**: `TransportRoute`, `TransportStop`, `StudentTransport` (a
  student's current route/stop, one at a time)
- **Staff**: `Staff` (employee/HR record, separate from `User` -- not
  every staff member has a login), `TeacherSubjectAssignment`,
  `StaffAttendance` (mirrors `AttendanceRecord` for staff, feeds payroll's
  loss-of-pay computation); `Section.classTeacherStaffId` is the FK for
  "who is the class teacher"
- **Payroll**: `SalaryStructure` + `SalaryComponent` (component-based:
  fixed or % of basic), `PayrollRun`, `Payslip`, `PayslipLineItem`
- **Promotion**: `StudentEnrollment` (historical per-session class/section,
  since `Student.currentClassId` is a single mutable pointer with no
  history otherwise), `PromotionBatch` + `PromotionBatchItem` (a
  reviewable, executable batch of per-student promote/retain/withdraw
  decisions)
- **Module settings**: `ModuleSetting`, one row per (branch, module)
  that's been explicitly toggled -- a module with no row defaults to
  enabled (see "Module toggles" below)
- **Audit log**: `AuditLog`, a generic append-only trail (see "Audit log"
  below)

Most models carry `deletedAt` (soft delete) and `version` (bumped on every
update, kept for optimistic-concurrency/audit value even without offline
conflict resolution to worry about). Real Prisma `@relation`s are used
throughout (not bare FK-id-as-string), giving referential integrity and
`include`-based joins instead of hand-written JOIN SQL -- `tenantId`/
`branchId` stay as plain scalars for tenant-scoping convenience rather than
relations.

## NestJS modules

One module per domain area, each following the same shape: `*.module.ts`,
`*.controller.ts` (guarded, permission-checked routes), `*.service.ts`
(business logic + Prisma calls), `dto/*.dto.ts` (`class-validator`-decorated
request bodies).

`AcademicModule`, `StudentsModule`, `AttendanceModule`, `FeesModule`,
`ExamsModule`, `HousesModule`, `LibraryModule`, `TransportModule`,
`StaffModule` (incl. staff attendance), `PayrollModule`, `PromotionModule`,
`RolesModule`, `UsersModule`, `ModuleSettingsModule`, `AuditLogModule`,
`DashboardModule`, plus `AuthModule` and the shared `AuditModule`.

**Response shape**: a global interceptor
(`apps/cloud-api/src/common/case-transform.interceptor.ts`) converts every
response body's keys from Prisma's camelCase to snake_case recursively, so
the REST contract is consistently snake_case regardless of whether a given
endpoint hand-maps its response or returns a raw Prisma result.

## Admissions & eligibility

`POST /admissions` leaves a student at `status = 'applied'` -- an
applicant, not yet a student the rest of the system should treat as real.
`POST /admissions/:id/confirm` (`StudentsService.confirmAdmission`) is what
a front-desk admin calls to actually enroll them: it assigns a
branch+year-scoped sequential admission number (`MAIN-2026-0001`) with a
bounded retry loop against Postgres's unique constraint to absorb
concurrent-write races, and flips the student to `enrolled`. Attendance
rosters, fee invoice generation, and exam marks rosters all filter on
`status = 'enrolled'`, so an unconfirmed applicant simply doesn't show up
in any of them -- `status` already carries the "eligible" meaning, with no
separate flag to keep in sync.

## Module toggles

Every module beyond the core (students/admissions, academic setup,
dashboard) can be turned off per branch via `ModuleSettingsModule`
(`TOGGLEABLE_MODULES` in `permission-catalog.ts`). The frontend
(`stores/app-store.ts`) loads a branch's disabled-module set on login/
branch-switch and uses it two ways: to filter which nav sections render
(`components/app-shell.tsx`), and as a route guard that redirects to the
dashboard if a disabled module's route is reached directly by URL -- so
hiding a nav item isn't the only thing standing between a user and a
module a school turned off. Disabling a module never touches its data;
toggling it back on picks up right where it left off.

## Staff, payroll, and session promotion

**Staff/HR** (`StaffModule`) is a full employee record, separate from
`User` (login identity) on purpose -- not every staff member needs or gets
a login (a driver, a peon). Creating a login / resetting a password are
the two operations that go through `UsersModule` (see RBAC above);
everything else about a staff member, including class-teacher and
subject-teacher assignment, is a regular CRUD write.

**Payroll** (`PayrollModule`) is deliberately scoped: a component-based
salary structure (fixed amount or % of basic per component) plus a
monthly `generatePayrollRun` that computes loss-of-pay automatically from
`StaffAttendance` (`present` = full paid day, `half_day` = half paid/half
LOP, `absent` = full LOP, proportional to `grossBeforeLop / daysInMonth`)
and writes one payslip + line items per staff member with a structure
configured. **What it explicitly does not do**: compute PF/ESI/
Professional-Tax/TDS against government slabs -- those are manual
deduction components on the salary structure, since statutory tax rules
change yearly and deserve dedicated compliance tooling, not a bolt-on.
Staff still capture PF/ESI/UAN/PAN/bank fields as plain data for
record-keeping and payslip printing. `componentAmount()` and
`daysInMonth()` are exported as pure functions and unit-tested directly
(`payroll.service.spec.ts`).

**Session promotion** (`PromotionModule`) solves the fact that
`Student.currentClassId` was a single mutable pointer with no history:
`StudentEnrollment` now records a student's class/section for every
session they were promoted/retained into, and `PromotionBatch` +
`PromotionBatchItem` let an admin review a suggested class mapping
(matched by `sortOrder + 1`, i.e. "the next class up", not by name) and
override individual students' decisions (promote to a specific class,
retain, or withdraw) before executing the batch transactionally. One
`AuditLog` row covers the whole batch rather than one per student, to keep
the trail scannable.

## Audit log

`AuditLog` is a generic, append-only trail -- `AuditService.record()` takes
a Prisma client or transaction handle and writes one row *inside the same
`$transaction` as the mutation it describes*, so the audit entry can never
commit without the write it documents (or vice versa). It's called from
every create/update/delete/status-change across the service layer, and it
never produces update/delete ops against itself -- once written, an entry
is permanent. `AuditLogModule`'s `GET /audit-log` (filterable by entity
table, actor, and date range) backs the Audit Log admin page.

## Edit and delete

Every entity that used to be create-only (students, guardians, classes,
sections, academic sessions, fee structures, invoices, payments, subjects,
exams, houses, library books, transport routes/stops, roles) has `PATCH`/
`DELETE` (or status-change) endpoints, not just `POST`, following the same
shape as every create endpoint: bump `version`, set `updatedAt`, write an
audit row in the same transaction. Deletions are soft (`deletedAt`) except
where a hard delete is harmless (e.g. removing a not-yet-executed
promotion batch item); money-adjacent actions (invoices, payments) use an
explicit void/reversal record rather than deleting history.

## Print output

Attendance registers, exam report cards, ID cards, and payslips are printed
client-side via `window.print()` against a small print stylesheet
(`index.css`): everything on the page is hidden except an element marked
`data-print-area` (and its descendants), so each printable view renders its
own clean, chrome-free layout in the same DOM rather than opening a
separate window or generating a PDF server-side.
