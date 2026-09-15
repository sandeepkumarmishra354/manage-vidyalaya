# From working software to a client-ready product

This is the plan for turning the current codebase (functionally complete
for Student Info, Attendance, Fees, and Exams) into something you can put in
front of a paying school and support. It's organized as phases with concrete
checklists, roughly in the order you'd tackle them. Nothing here needs to be
done all at once -- "Phase 1" is the bar for your *first* paying school;
later phases are what you build out as you scale past a handful of clients.

## Where things stand today

Working: an online-only architecture where cloud-api (NestJS + Postgres)
is the sole system of record and `apps/web` is a plain React SPA talking
to it over HTTPS -- no local database, no offline mode, no native shell.
JWT auth with refresh tokens, and a full module set (Student Info &
Admissions, Attendance, Fees & Billing, Exams & Report Cards, Houses,
Library, Transport, ID Cards, Academic Setup with session promotion,
Staff/HR, Payroll, Roles & Permissions, Audit Log) with a consistent UI,
granular RBAC enforcement on every endpoint, and edit/delete on every
entity, not just create. Running locally, with a local Postgres and a
demo tenant.

Not yet done, and covered below: real hosting, HTTPS, secrets management,
backups, error monitoring, a deployed web build, a real onboarding flow
(today there's one hardcoded demo tenant), legal basics, and a support
process. None of this is optional for a paying client, even one -- it's
the difference between a demo and a product.

---

## Phase 1 -- Bar for your first paying school

You cannot sell this without all of the following. Budget this as its own
project phase, not a footnote.

### 1. Hosting & infrastructure

- Put `cloud-api` + Postgres on a real host. For one school, a single small
  VM (DigitalOcean, Hetzner, AWS Lightsail -- Mumbai/Bangalore region for
  latency) running Docker Compose (Postgres + cloud-api + a reverse proxy)
  is plenty. Don't over-engineer with Kubernetes at this stage.
- **HTTPS is mandatory** -- the web app sends passwords and JWTs over this
  connection, and browsers block a mixed-content HTTPS page from calling
  an `http://` API anyway. Use Caddy or nginx + Let's Encrypt in front of
  cloud-api. Never ship `http://` to a client.
- A real domain for cloud-api (e.g. `api.vidyalaya.in`), not an IP address
  -- needed for TLS. The web app itself needs its own domain too (e.g.
  `app.vidyalaya.in`), since it's now just a static site a browser loads.
- Automated Postgres backups (`pg_dump` on a cron, shipped off-box to S3/
  Backblaze/etc., not just sitting on the same disk). Test the restore
  process before you need it for real -- an untested backup is not a backup.
- Environment variables/secrets (`JWT_SECRET`, `DATABASE_URL`) managed
  properly: not committed to git (already `.gitignore`d), rotated if ever
  exposed, different values in prod vs. dev.

### 2. Web app hosting & deployment

Being a plain static SPA (`apps/web` builds to `dist/` via `vite build`)
turns what used to be per-platform installer/code-signing/auto-update work
into a much smaller problem: build, upload, done.

- **Static hosting.** Any static host works -- Vercel, Netlify, Cloudflare
  Pages, or an S3 bucket behind CloudFront/nginx if you'd rather keep
  everything on your own VM alongside cloud-api. No server-side rendering
  is needed; it's a pure client-side app.
- **Cache headers.** `index.html` should be `no-cache` (so a new deploy is
  picked up immediately on next load) while the hashed `assets/*.js`/`.css`
  files Vite produces can be cached aggressively/immutably -- their
  filenames change on every build, so there's no staleness risk.
- **Bake `VITE_API_BASE_URL` in at build time** (it's a `.env` value read
  by Vite, see `apps/web/.env.example`) pointing at your deployed cloud-api
  domain -- don't ship a build that still points at `localhost:3001`.
- Rollout is now "push a new build," not "get everyone to reinstall" --
  every school is always on the latest version the moment you deploy, with
  no auto-update mechanism to build or maintain.

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

- Since there's no local database, data safety is entirely cloud-api's
  Postgres backup story (see above) -- a lost/stolen laptop carries no data
  with it, only a cached JWT. One deliberate simplification remains: the
  *seeded demo* tenant/branch/roles still use fixed ids rather than ones
  from a real provisioning flow (`apps/cloud-api/prisma/seed.ts`) -- revisit
  once real school signup exists (see item 3 above).
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
- **Lock down CORS before going live.** `app.enableCors()` on cloud-api
  currently allows every origin -- harmless while the frontend was a Tauri
  webview (which doesn't send `Origin` the way browsers do), but now that
  `apps/web` is a real browser app this is a genuine open door: restrict
  cloud-api's CORS to your deployed web app's actual origin
  (`app.vidyalaya.in` or whatever domain you land on) as part of the same
  deploy that ships the web build, not as a follow-up.
- Run the `security-review` workflow (or equivalent manual review) against
  the current diff before your first deploy, specifically checking: every
  Prisma query goes through the query builder (no raw SQL string
  concatenation) so there's no injection surface to audit table-by-table,
  and JWT secret strength.

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

- **CI/CD**: GitHub Actions running `pnpm turbo run build lint typecheck
  test` on every PR; auto-deploy cloud-api and the `apps/web` static build
  on merge to main after tests pass.
- **Error monitoring**: Sentry (or similar) in both cloud-api and the web
  app's browser-side JS, so you learn about crashes before the school
  calls you.
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
- **Concurrent-edit handling**: every write already goes straight to
  Postgres, so there's no sync-conflict window, but two staff editing the
  same record at once can still silently clobber each other's changes
  (last write to commit wins). The `version` column on most tables is
  there for exactly this -- start enforcing optimistic-concurrency checks
  (reject a write whose `version` doesn't match the current row) once
  schools have several front-desk devices editing the same records.
- **Statutory payroll compliance**: Payroll currently treats PF/ESI/
  Professional-Tax/TDS as manually configured deduction components, not
  computed against government slabs (a deliberate v1 scope boundary --
  see `docs/architecture.md`). Revisit if/when a client needs automated
  compliance filing; this needs dedicated tooling kept current with
  yearly rule changes, not a bolt-on to the salary-structure model.
- **Formal SLA & uptime monitoring** (UptimeRobot/Better Stack, cheap and
  simple) once cloud-api being down means multiple schools can't work at
  all -- there's no offline fallback.

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
- Don't self-host secrets or skip HTTPS "just for the pilot" -- pilots
  become production the moment real student data goes in, and by then
  it's much harder to migrate.
- Don't leave cloud-api's CORS wide open past your first real deploy --
  it's a one-line fix (see Security basics above) and easy to forget
  precisely because an open CORS config doesn't break anything visibly.

## Suggested immediate next steps, in order

1. Stand up cloud-api on a real VM with HTTPS + automated Postgres backups.
2. Deploy `apps/web`'s static build to a real host and domain, with
   `VITE_API_BASE_URL` pointed at cloud-api, then lock cloud-api's CORS
   down to that domain.
3. Build the minimal manual tenant-provisioning path (random UUIDs, no more
   hardcoded demo tenant) and an admin-triggered password reset.
4. Add login rate-limiting. (Audit logging itself is done -- see above.)
5. Get a privacy policy/ToS drafted (DPDP-aware) and a one-page service
   agreement.
6. Pilot with one real school, watching closely, before taking on a second.
