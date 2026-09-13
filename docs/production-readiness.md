# From working software to a client-ready product

This is the plan for turning the current codebase (functionally complete
for Student Info, Attendance, Fees, and Exams) into something you can put in
front of a paying school and support. It's organized as phases with concrete
checklists, roughly in the order you'd tackle them. Nothing here needs to be
done all at once -- "Phase 1" is the bar for your *first* paying school;
later phases are what you build out as you scale past a handful of clients.

## Where things stand today

Working: the offline-first architecture (SQLite + outbox sync, proven with
a real two-device test), JWT auth with offline session caching, and a full
module set (Student Info & Admissions, Attendance, Fees & Billing, Exams &
Report Cards, Houses, Library, Transport, ID Cards, Academic Setup with
session promotion, Staff/HR, Payroll, Roles & Permissions, Audit Log) with
a consistent UI, granular RBAC enforcement, and edit/delete on every
entity, not just create. Running locally, with a local Postgres and a demo
tenant.

Not yet done, and covered below: real hosting, HTTPS, secrets management,
backups, error monitoring, a signed/installable desktop build, a real
onboarding flow (today there's one hardcoded demo tenant), legal basics,
and a support process. None of this is optional for a paying client, even
one -- it's the difference between a demo and a product.

---

## Phase 1 -- Bar for your first paying school

You cannot sell this without all of the following. Budget this as its own
project phase, not a footnote.

### 1. Hosting & infrastructure

- Put `cloud-api` + Postgres on a real host. For one school, a single small
  VM (DigitalOcean, Hetzner, AWS Lightsail -- Mumbai/Bangalore region for
  latency) running Docker Compose (Postgres + cloud-api + a reverse proxy)
  is plenty. Don't over-engineer with Kubernetes at this stage.
- **HTTPS is mandatory** -- the desktop app sends passwords and JWTs over
  this connection. Use Caddy or nginx + Let's Encrypt in front of cloud-api.
  Never ship `http://` to a client.
- A real domain (e.g. `api.vidyalaya.in` or similar), not an IP address --
  needed for TLS and for the desktop app's default config.
- Automated Postgres backups (`pg_dump` on a cron, shipped off-box to S3/
  Backblaze/etc., not just sitting on the same disk). Test the restore
  process before you need it for real -- an untested backup is not a backup.
- Environment variables/secrets (`JWT_SECRET`, `DATABASE_URL`) managed
  properly: not committed to git (already `.gitignore`d), rotated if ever
  exposed, different values in prod vs. dev.

### 2. Desktop app distribution

- **Code signing.** Unsigned Windows/macOS builds trigger scary OS warnings
  ("unknown publisher") that will make a school's IT person refuse to
  install it. Windows: get a code-signing certificate (~$100-400/yr).
  macOS: an Apple Developer account ($99/yr) + notarization. Tauri has
  built-in support for both -- configure it in `tauri.conf.json`'s
  `bundle.windows`/`bundle.macOS` sections before your first real install.
- **Auto-update.** Use Tauri's built-in updater plugin so bug fixes and new
  modules reach installed schools without a manual reinstall. Set this up
  *before* your first client, not after -- retrofitting an update channel
  onto machines you can't remotely access is painful.
- Decide the installer flow: a downloadable `.msi`/`.exe` (Windows is what
  most Indian schools run) hosted somewhere you control, with a simple
  "download and run" instruction sheet for non-technical staff.

### 3. Real tenant onboarding (replace the demo seed)

Today, `prisma/seed.ts` hardcodes one demo tenant. Before a real client:

- Build a minimal provisioning path: even a manual one is fine at first
  (you, the vendor, run a script that creates their tenant + first admin
  user + branch), but it must generate **real random UUIDs**, not the fixed
  demo ones. A tiny internal admin CLI or protected endpoint is enough for
  the first several schools -- a self-serve signup UI is a later-phase nice
  to have, not a Phase 1 requirement.
- Password reset flow. Right now there's login and nothing else -- a school
  admin *will* forget their password. At minimum: an admin-triggered reset
  (you reset it for them) is acceptable for your first client; a proper
  "forgot password" email flow is Phase 2.

### 4. Data safety & correctness

- ~~Fix academic sessions/classes/sections not syncing~~ **Done.** They now
  go through the same outbox path as everything else, and
  `create_academic_session`/`create_class`/`create_section` exist so a
  school can add more than the one seeded class in the first place -- see
  `docs/architecture.md`. One deliberate simplification remains: the
  *seeded demo* branch/session/class/section still use fixed ids rather
  than ones pulled from a real provisioning flow (documented in
  `apps/desktop/src-tauri/src/seed.rs`) -- revisit once real school signup
  exists.
- Decide and document your backup/data-loss story for the *desktop* side
  too: if a laptop is lost/stolen before ever syncing, that data is gone.
  Make sure staff understand "sync often" is not optional, and consider a
  periodic local `.sqlite3` file backup reminder in the UI.
- Run the existing test suites in CI (see below) on every change so a
  regression never reaches a client silently.

### 5. Security basics

- Rate-limit `/auth/login` on cloud-api (a few attempts per IP/email per
  minute) -- right now it's uncapped, which is a brute-force risk.
  `@nestjs/throttler` is a one-file addition.
- Enforce a minimum password policy server-side (length at least; a
  password strength meter client-side is a nice-to-have).
- ~~Add basic audit logging~~ **Done.** A generic, append-only `audit_log`
  now covers every create/update/delete across every module (see
  `docs/architecture.md`'s "Audit log" section), with an admin-facing
  filterable viewer.
- Run `docs/../` -- actually just run the `security-review` workflow (or
  equivalent manual review) against the current diff before your first
  deploy, specifically checking: SQL injection surface (the dynamic
  `INSERT OR REPLACE` / outbox-apply code paths use an allowlist already --
  keep it that way as you add tables), JWT secret strength, and CORS
  config on cloud-api (`app.enableCors()` currently allows everything --
  restrict it to your desktop app's actual origin needs before going live,
  or confirm it's fine given Tauri apps don't send an `Origin` header the
  way browsers do).

### 6. Support & legal basics

- A privacy policy and terms of service. You're processing minors' personal
  data (names, DOB, addresses, guardian contact info) -- India's **Digital
  Personal Data Protection Act (DPDP), 2023** applies, and processing
  children's data has extra obligations (verifiable parental consent,
  no tracking/targeted ads). Get this reviewed by a lawyer who knows Indian
  data protection law before onboarding a real school; don't wing this
  clause yourself.
- A support channel the school actually knows about (WhatsApp Business
  number, email, or a simple helpdesk tool) and a stated response-time
  expectation, even an informal one ("we respond within 1 business day").
- A written (even if simple) agreement covering: what you're delivering,
  what "support" means, what happens to their data if they stop paying,
  and your liability limits. A one-page agreement beats a handshake.

---

## Phase 2 -- Once you have a few paying schools

- **CI/CD**: GitHub Actions running `cargo test`, `cargo clippy`,
  `pnpm turbo run build lint typecheck`, and the cloud-api test suites on
  every PR; auto-deploy cloud-api on merge to main after tests pass.
- **Error monitoring**: Sentry (or similar) in both cloud-api and the
  desktop app's Rust/JS layers, so you learn about crashes before the
  school calls you.
- **Structured logging + basic metrics** on cloud-api (request rates, sync
  push/pull volume, login failures) -- start with something simple
  (pino + a log aggregator) rather than building an observability stack.
- **Real school signup flow**: a form, not a script you run by hand --
  branch/plan selection, payment collection, automatic tenant creation with
  the entitlement/subscription fields already modeled in `tenants`.
- **Payment gateway integration** (Razorpay is the standard choice for
  Indian SaaS): both for *your* subscription billing from schools, and
  optionally for parent-facing online fee payment inside the product
  itself (a strong differentiator -- ties into the `fee_invoices` model
  already in place).
- **SMS/WhatsApp notifications** for fee due reminders and attendance
  alerts -- genuinely expected by Indian schools; the MSG91/Gupshup/
  WhatsApp Business API integrations are well-trodden.
- **Multi-device conflict handling**: revisit the documented last-write-
  wins limitation once you have schools with several front-desk devices
  editing the same records concurrently.
- **Statutory payroll compliance**: Payroll currently treats PF/ESI/
  Professional-Tax/TDS as manually configured deduction components, not
  computed against government slabs (a deliberate v1 scope boundary --
  see `docs/architecture.md`). Revisit if/when a client needs automated
  compliance filing; this needs dedicated tooling kept current with
  yearly rule changes, not a bolt-on to the salary-structure model.
- **Formal SLA & uptime monitoring** (UptimeRobot/Better Stack, cheap and
  simple) once cloud-api being down means multiple schools can't sync.

## Phase 3 -- Scaling past a handful of schools

- Move from "I manually provision tenants" to true self-serve multi-tenant
  SaaS (the data model already carries `tenant_id` everywhere for this).
- Consider managed Postgres (RDS/Supabase/Neon) over self-hosting once
  backup/failover operations become a time sink.
- GST-compliant invoicing if you start charging schools with proper tax
  invoices (or if schools use the product for taxable services like
  transport/hostel fees).
- A proper admin/reporting dashboard for you (the vendor) to see tenant
  health, usage, and billing status across all schools.
- Formal penetration test / third-party security audit before handling a
  large number of schools' student data.

---

## What NOT to do

- Don't build a self-serve signup flow, payment gateway, or SMS
  integration before you have a Phase-1-ready product and at least one
  committed pilot school -- these are Phase 2 investments that don't matter
  until Phase 1 is solid.
- Don't skip code signing "for now" -- it's the single most common reason
  a non-technical school IT person abandons an install, and retrofitting
  it later means re-issuing installers to everyone.
- Don't self-host secrets or skip HTTPS "just for the pilot" -- pilots
  become production the moment real student data goes in, and by then
  it's much harder to migrate.

## Suggested immediate next steps, in order

1. ~~Fix the academic-structure sync gap~~ Done.
2. Stand up cloud-api on a real VM with HTTPS + automated Postgres backups.
3. Wire up Tauri code signing + auto-update for at least one platform
   (whichever your pilot school uses -- almost certainly Windows).
4. Build the minimal manual tenant-provisioning path (random UUIDs, no more
   hardcoded demo tenant) and an admin-triggered password reset.
5. Add login rate-limiting. (Audit logging itself is done -- see above.)
6. Get a privacy policy/ToS drafted (DPDP-aware) and a one-page service
   agreement.
7. Pilot with one real school, watching closely, before taking on a second.
