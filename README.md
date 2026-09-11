# Vidyalaya

Offline-first, multi-branch school management software for Indian schools and
colleges. Desktop app built on Tauri v2, syncing to a cloud backend when
connectivity is available.

See `docs/architecture.md` for the design (sync engine, data model, auth) and
build-order rationale, and `docs/production-readiness.md` for the plan to
take this from working software to something you can hand to a paying
school.

## Modules implemented so far

- **Student Info & Admissions** -- enquiry-to-enrollment workflow, guardian
  records, class/section assignment, and admission confirmation (assigns a
  real admission number and flips the student to `enrolled` -- only
  enrolled students are eligible for attendance/fees/exams)
- **Attendance** -- daily attendance per class/section, marked offline, with
  a client-side printable register
- **Fees & Billing** -- fee structures, invoice generation, payments/receipts
  (amounts in paise, not floats)
- **Exams & Report Cards** -- subjects, exams, marks entry, per-student
  report cards with client-side printing
- **Houses** -- house teams, a points ledger (awards/deductions with a
  reason and audit trail), and a leaderboard
- **Library** -- book catalog and issue/return tracking
- **Transport** -- bus routes, stops, and student assignments
- **ID Cards** -- 4 selectable print-ready templates, single or whole-class
- **Academic Setup** -- academic sessions, classes, and sections (create as
  many as the school needs -- these sync like everything else)
- **Module Settings** -- every optional module above can be turned off
  per branch; disabled modules disappear from the nav and are also
  route-guarded, but their data is never deleted
- **Dashboard** -- real aggregate stats and charts (enrollment by class, fee
  status breakdown, 14-day attendance trend, house leaderboard)

All of the above are wired through the same offline-write -> outbox -> sync
architecture proven by the Student Info module, and are reachable from the
app's left nav (grouped into Academics / Finance / Services / Admin) once
logged in.

## Structure

```
apps/
  desktop/      Tauri v2 app: React + TypeScript + Tailwind + shadcn/ui frontend,
                Rust backend (SQLite via rusqlite, sync engine, Tauri commands)
  cloud-api/    NestJS + Prisma + PostgreSQL: auth, billing, and the sync
                push/pull API
packages/
  shared-types/ TypeScript types shared between desktop and cloud-api
  db-schema/    SQL migrations -- the source of truth for the desktop's
                local SQLite schema
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
pnpm tauri dev
```

The desktop app works immediately offline (it seeds its own demo
tenant/branch locally on first run, using the same fixed ids as the
cloud-api seed script -- see comments in `src-tauri/src/seed.rs`). Logging in
against a running cloud-api enables sync; after that first login the app
keeps working fully offline using the cached session.

## Verifying the sync engine

`apps/desktop/src-tauri/tests/sync_integration.rs` spins up two independent
local SQLite databases ("device A" and "device B"), creates an admission
offline on device A, and asserts it reaches device B purely through the
sync engine, against a real running cloud-api:

```bash
# with cloud-api running and seeded (see above)
cd apps/desktop/src-tauri
cargo test --test sync_integration -- --ignored --nocapture
```

It's `#[ignore]`d by default since it depends on that external process --
regular `cargo test` stays green without cloud-api running.

`apps/desktop/src-tauri/tests/modules_integration.rs` covers Attendance,
Fees & Billing, and Exams & Report Cards against a real local SQLite
database (no network needed) -- marking/re-marking attendance, generating
and paying off a fee invoice, and rolling up exam marks into a report card.
Runs as part of plain `cargo test`.

## Common commands

```bash
pnpm turbo run build       # build all apps/packages
pnpm turbo run lint        # lint all apps/packages
pnpm turbo run typecheck   # typecheck all apps/packages

cd apps/desktop/src-tauri && cargo test && cargo clippy --all-targets
cd apps/cloud-api && pnpm test && pnpm test:e2e
```
