# Vidyalaya

Online-only, multi-branch school management software for Indian schools and
colleges. A thin Tauri v2 desktop shell around a React frontend that talks
directly to a NestJS + PostgreSQL cloud backend over HTTPS -- no local
database, no offline mode.

See `docs/architecture.md` for the design (data model, auth, RBAC) and
`docs/production-readiness.md` for the plan to take this from working
software to something you can hand to a paying school.

## Modules implemented so far

- **Student Info & Admissions** -- enquiry-to-enrollment workflow, guardian
  records, class/section assignment, and admission confirmation (assigns a
  real admission number and flips the student to `enrolled` -- only
  enrolled students are eligible for attendance/fees/exams)
- **Attendance** -- daily attendance per class/section, with a client-side
  printable register
- **Fees & Billing** -- fee structures, invoice generation, payments/receipts
  (amounts in paise, not floats)
- **Exams & Report Cards** -- subjects, exams, marks entry, per-student
  report cards with client-side printing
- **Houses** -- house teams, a points ledger (awards/deductions with a
  reason and audit trail), and a leaderboard
- **Library** -- book catalog and issue/return tracking
- **Transport** -- bus routes, stops, and student assignments
- **ID Cards** -- 4 selectable print-ready templates, single or whole-class
- **Academic Setup** -- academic sessions, classes, and sections, plus a
  **session promotion** wizard (suggested class mapping, per-student
  promote/retain/withdraw review, batch execution with full enrollment
  history)
- **Staff / HR** -- employee records (employment, contact, statutory/bank
  details), class-teacher and subject-teacher assignments, staff
  attendance, and admin-triggered login creation/password reset
- **Payroll** -- component-based salary structures (fixed or % of basic),
  monthly payroll runs with loss-of-pay computed automatically from staff
  attendance, and printable payslips
- **Roles & Permissions** -- custom roles with a granular, per-action
  permission grid (not just the five seeded defaults), enforced on every
  cloud-api endpoint
- **Audit Log** -- a generic, append-only trail of every create/update/
  delete across every module, filterable by entity and date
- **Module Settings** -- every optional module above can be turned off
  per branch; disabled modules disappear from the nav and are also
  route-guarded, but their data is never deleted
- **Dashboard** -- real aggregate stats and charts (enrollment by class, fee
  status breakdown, 14-day attendance trend, house leaderboard)
- **Edit everywhere** -- every entity above (students, staff, classes,
  sessions, fee structures, invoices, payments, subjects, exams, houses,
  library books, transport routes/stops, roles) has update/soft-delete
  endpoints, not just create

Every module is a real Postgres table with full CRUD REST endpoints,
guarded by JWT auth + permission checks, and reachable from the app's left
nav (grouped into Academics / Staff / Finance / Services / Admin) once
logged in.

## Structure

```
apps/
  desktop/      Tauri v2 app: React + TypeScript + Tailwind + shadcn/ui
                frontend talking to cloud-api over plain fetch(); the Rust
                side is just the native window bootstrap, nothing else
  cloud-api/    NestJS + Prisma + PostgreSQL: the entire system of record --
                auth, every domain entity, RBAC, and audit logging
```

## Prerequisites

- Node.js 20+, pnpm 10+
- Rust stable + Tauri v2 Linux build deps (`libwebkit2gtk-4.1-dev`,
  `libjavascriptcoregtk-4.1-dev`, `libgtk-3-dev`, `libsoup-3.0-dev`,
  `libayatana-appindicator3-dev`, `librsvg2-dev`, `build-essential`)
- PostgreSQL 14+ (for cloud-api)

## First-time setup

```bash
pnpm install

# cloud-api: point at your Postgres instance
cd apps/cloud-api
cp .env.example .env   # edit DATABASE_URL if needed
pnpm prisma:migrate    # creates the schema
pnpm prisma:seed       # creates a demo tenant/branch/admin user
pnpm dev                # starts on :3001
```

Demo login (from the seed script): `admin@demo.vidyalaya.in` /
`vidyalaya-demo`.

In another terminal:

```bash
cd apps/desktop
cp .env.example .env   # edit VITE_API_BASE_URL if cloud-api isn't on :3001
pnpm tauri dev
```

The desktop app is unusable without a running cloud-api -- there is no local
data and no offline fallback. Login calls `POST /auth/login`, the app then
fetches `GET /auth/me` for session/branch/permission data, and every page
after that reads and writes directly against cloud-api's REST endpoints.

## Common commands

```bash
pnpm turbo run build       # build all apps/packages
pnpm turbo run lint        # lint all apps/packages
pnpm turbo run typecheck   # typecheck all apps/packages
pnpm turbo run test        # test all apps/packages

cd apps/desktop/src-tauri && cargo build && cargo clippy --all-targets
cd apps/cloud-api && pnpm test && pnpm test:e2e
```
