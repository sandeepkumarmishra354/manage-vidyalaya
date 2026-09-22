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
- A real domain, with TLS -- either a dedicated one for cloud-api (e.g.
  `api.vidyalaya.in`, with the web app on its own domain like
  `app.vidyalaya.in`), or a single domain serving both, which is what the
  `/api` prefix below exists for.
- **Every cloud-api route lives under `/api`** (`app.setGlobalPrefix("api")`
  in `src/main.ts`) specifically so one reverse proxy on one domain can
  route by path alone: send `/api/*` to cloud-api and everything else to
  the web app's static build. An nginx `location` block for this:
  ```nginx
  location /api/ {
      proxy_pass http://127.0.0.1:3001;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
  }
  location / {
      root /var/www/vidyalaya-web;
      try_files $uri /index.html;
  }
  ```
  (Caddy's equivalent is a `handle_path /api/*` block reverse-proxying to
  `127.0.0.1:3001`, with everything else falling through to `file_server`.)
  Don't strip the `/api` prefix when proxying -- cloud-api expects to see
  it (`proxy_pass http://127.0.0.1:3001;`, not
  `proxy_pass http://127.0.0.1:3001/;`, which nginx would otherwise use to
  rewrite it away). With this single-domain setup, **leave
  `VITE_API_BASE_URL` unset** in the web build -- unset means "same
  origin as this page" (`apps/web/src/lib/http.ts`), which already
  prepends `/api` to every request. Set `TRUST_PROXY=1` (see
  Security basics below) since the proxy is now the only thing cloud-api
  ever sees a connection from. **Set `PUBLIC_API_BASE_URL`** to your
  actual public origin too (e.g. `https://managevidya.in`) -- it's what
  `LocalStorageDriver` uses to build the presigned upload/download URLs
  returned to the browser for documents/receipts/photos; left unset it
  defaults to `http://localhost:3001`, which is unreachable from a real
  browser.
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

### 3. Real tenant onboarding (vendor-admin-web, not the demo seed)

`apps/cloud-api/scripts/seed-e2e.ts` hardcodes one fixed-UUID demo tenant
purely for local dev exploration and the Playwright E2E suite -- it is
never what you run for a real school, and has no bearing on production.
Each real school gets its own subdomain (e.g. `greenwood.yourdomain.tld`)
which the backend uses to resolve the correct tenant at login (see
`AuthService.login` -- this is what makes two schools safely sharing the
same admin email a non-issue).

**Primary path: `apps/vendor-admin-web`.** A small separate app
(`apps/vendor-admin-api` + `apps/vendor-admin-web`, port 3002/5175 in
dev) purpose-built for this -- log in as a vendor operator, fill in the
new-tenant form (school name, subdomain, first branch, admin name/email,
plan tier), and it provisions the tenant the same way `create-tenant.ts`
does (same transaction shape: branch, current academic session, the 5
system roles, default staff categories/leave types/fee categories/master
data, retention policies, and the first super_admin user), then shows you
the generated admin credentials once. It also lists every tenant with
live usage counts against its plan limits, and lets you edit a tenant's
plan tier, trial/subscription expiry, or suspend it.

Deploy it once alongside cloud-api (own `DATABASE_URL` using the
schema-owning role -- see `apps/vendor-admin-api/.env.example` -- and its
own `VENDOR_JWT_SECRET`, deliberately separate from cloud-api's
`JWT_SECRET` so a vendor operator token is never accepted by a tenant-
scoped cloud-api endpoint or vice versa), then bootstrap your first
vendor operator login once, from `apps/vendor-admin-api`:
```
pnpm create-vendor-admin --email=you@example.com --full-name="Your Name"
```
(there's deliberately no self-service signup for this table -- see
`apps/vendor-admin-api/scripts/create-vendor-admin.ts`). Every school
after that is onboarded through the vendor-admin-web UI, no shell access
needed.

**Fallback / scripting path: `apps/cloud-api/scripts/create-tenant.ts`.**
Same provisioning logic as vendor-admin-web's `POST /tenants`, run
directly from a shell -- useful for one-off scripting or if
vendor-admin-web isn't deployed yet:
```
cd apps/cloud-api
pnpm create-tenant \
  --school-name="Greenwood International School" \
  --subdomain=greenwood \
  --branch-name="Main Campus" \
  --branch-code=MAIN \
  --admin-name="Jane Doe" \
  --admin-email=admin@greenwood.example
```
(Omit `--admin-password` to have one generated and printed once.) It
prints the tenant id and admin credentials on success.

Either way, onboarding one school is then:

1. **DNS.** Create one CNAME record per school:
   `<subdomain>.yourdomain.tld` -> the same target every time (wherever
   the web app's static build is hosted, see item 2 above). One frontend
   deployment and one cloud-api backend serve every school -- there is no
   per-school build or deploy, only per-school DNS records.
2. **SSL.** Either a wildcard cert for `*.yourdomain.tld`, or let the
   static host auto-provision one per custom domain as it's added
   (Vercel/Netlify/Cloudflare Pages all do this) -- use whichever your
   chosen host makes easiest.
3. **Provision the tenant** via vendor-admin-web (or `create-tenant.ts`,
   see above).
4. **Verify.** Visit `https://<subdomain>.yourdomain.tld`, log in with
   the printed admin credentials, and confirm the dashboard loads with
   the right school name.
5. **Hand off.** Give the admin credentials to the school and have them
   change the password after first login.

Two gaps remain, deliberately out of scope for this runbook and flagged
as fast-follows once you're depending on this for real schools rather
than a single demo tenant (both already noted in Security basics below):
password-reset flow (today there's login and nothing else -- an
admin-triggered reset is the stopgap until a proper "forgot password"
email flow exists) and login rate-limiting.

### 4. Data safety & correctness

- Since there's no local database, data safety is entirely cloud-api's
  Postgres backup story (see above) -- a lost/stolen laptop carries no data
  with it, only a cached JWT. The *seeded demo* tenant/branch/roles
  (`apps/cloud-api/scripts/seed-e2e.ts`) still use fixed ids, by design --
  it's local-dev/E2E-only, never run against a production database. Every
  real school provisioned via vendor-admin-web or `create-tenant.ts` (see
  item 3 above) already gets real random UUIDs throughout.
- Run the existing test suites in CI (see below) on every change so a
  regression never reaches a client silently.
- **A multi-branch, multi-role Playwright E2E suite** (`apps/e2e/`, run via
  `pnpm test:e2e`) covers the whole app end to end, not just unit-tested
  business logic -- 150+ tests across 6 personas (`super_admin`,
  `branch_admin`, `accountant`, `front_desk`, and two `teacher` logins
  wired into real class-teacher/subject-assignment rows, so
  `ScopedAccessService`'s additive authorization paths are actually
  exercised, not just flat permissions) and 2 branches (`Main Campus`,
  the original demo branch kept pristine for human demos, and
  `North Campus`, a second seeded branch that's this suite's sandbox for
  everything that creates or mutates data). Coverage: cross-branch and
  cross-tenant data isolation, every route's permission boundary, the
  full academic lifecycle (admissions through promotion, timetable,
  school calendar), the full money-flow lifecycle (fee invoices,
  discounts, payroll runs, expenses), and one lifecycle test per
  remaining module (library, transport, houses, documents, QR scan
  attendance, dashboard, roles/users/audit log, master data). Runs in CI
  on every push/PR (`.github/workflows/e2e.yml`) against a fresh Postgres
  service container. See `apps/e2e/README.md` for the persona table and
  how to run it locally.
  - Writing this suite found and fixed three real bugs of the same root
    cause (soft-deleting a row leaves its unique-index slot permanently
    occupied, so recreating it later throws an unhandled 500): the
    original timetable period-slot `sort_order` collision, a payroll-run
    period-reuse bug, and 9 further tables found by auditing every
    soft-delete call site the same way once the pattern was recognized
    (`calendar_holidays`, `class_subjects`, `subject_elective_groups`,
    `subject_elective_group_members`, `fee_categories`, `fee_discounts`,
    `master_data_items`, `staff_categories`, `roles`,
    `teacher_subject_assignments`) -- all fixed by replacing the plain
    unique index with one scoped to `WHERE deleted_at IS NULL`. Worth
    keeping in mind for any *new* soft-deletable table added later: give
    its unique index the same `WHERE deleted_at IS NULL` clause from the
    start, or reuse-the-existing-row-via-`ON CONFLICT` the way
    `fee_discounts`' student-assignment path and `timetable_entries`
    already do.

### 5. Security basics

- ~~Rate-limit `/auth/login`~~ **Done.** `@nestjs/throttler` is wired in
  globally (`ThrottlerModule` + `APP_GUARD` in `app.module.ts`), with a
  generous baseline (300 requests/60s per IP) across every endpoint as a
  defense-in-depth floor against basic scripted abuse, plus two much
  stricter overrides on the endpoints that actually matter:
  - `POST /auth/login`: 10 attempts/60s, bucketed by **(source IP, target
    email)** rather than IP alone (`auth/login-throttle-key.ts`) -- an
    attacker guessing one account's password gets capped regardless of
    which email they're trying, without also locking out every other
    staff member logging into their own account from behind the same
    school's shared NAT IP.
  - `POST /users/:id/reset-password`: 10 attempts/60s per IP, on top of
    its existing `users.manage` permission gate -- defense-in-depth
    against a compromised/malicious admin session mass-resetting
    passwords.
  - `GET /health` is exempt (`@SkipThrottle()`) since it's hit
    continuously by uptime monitors/load balancers/readiness probes.
  - **`TRUST_PROXY=1`** must be set once deployed behind the Caddy/nginx
    reverse proxy from item 1 above -- otherwise every request looks
    like it comes from the proxy's own IP, collapsing every real client
    into one shared rate-limit bucket. Never set it on a directly
    internet-facing instance (lets a client spoof its IP and dodge the
    limit). See the `TRUST_PROXY` comment in `src/main.ts` and
    `.env.example`.
  - The E2E suite (`apps/e2e/`) legitimately logs the same fixed persona
    emails in far more than 10 times/minute from one IP across its
    150+ tests -- it sets `THROTTLE_DISABLED=1` on cloud-api's own
    `webServer` entry (`playwright.config.ts`) and in the CI workflow's
    `.env`, wired so this can never accidentally end up set in
    production. Never set it outside test environments.
- Password reset flow. Right now there's login and nothing else -- a school
  admin *will* forget their password. At minimum: an admin-triggered reset
  (you reset it for them) is acceptable for your first client; a proper
  "forgot password" email flow is Phase 2. **Fast-follow, not yet done.**
- Enforce a minimum password policy server-side (length at least; a
  password strength meter client-side is a nice-to-have).
- ~~Add basic audit logging~~ **Done.** A generic, append-only `audit_log`
  now covers every create/update/delete across every module (see
  `docs/architecture.md`'s "Audit log" section), with an admin-facing
  filterable viewer.
- ~~Lock down CORS before going live~~ **Done** (the mechanism; setting
  the env var for your actual production origin is still a deploy-time
  step). cloud-api's CORS allowlist is controlled by the
  `CORS_ALLOWED_ORIGINS` env var (`apps/cloud-api/src/common/cors.ts`), a
  comma-separated list of exact origins or single-level subdomain
  wildcards. For `managevidya.in`:
  ```
  CORS_ALLOWED_ORIGINS="https://managevidya.in,https://*.managevidya.in"
  ```
  -- the wildcard covers every school's subdomain
  (`school1.managevidya.in`, `school2.managevidya.in`, ...) in one entry,
  so no CORS change is needed when onboarding a new school; the bare
  apex is listed separately in case the marketing/login-landing page is
  ever served from there. Leaving it unset allows every origin (harmless
  in local dev; a genuine open door in production) -- **set it as part
  of the same deploy that first ships a real browser-facing origin**, not
  as a follow-up.
- Run the `security-review` workflow (or equivalent manual review) against
  the current diff before your first deploy, specifically checking: every
  raw SQL query is parameterized (`$1`/`$2`/...), never built by
  concatenating/interpolating request input into the query string, and
  every query includes its own `tenant_id` predicate (Row-Level Security
  is the backstop for a forgotten one, not a reason to skip writing it --
  see `docs/architecture.md`'s "Data access & tenant isolation"), and JWT
  secret strength.

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

### 7. Data retention & erasure (DPDP)

DPDP requires erasing personal data once its purpose is served and no
other law requires keeping it. This app has a first, narrow slice of that
today -- **not** full compliance, and the legal groundwork in section 6
above still has to happen separately.

- **What exists**: a per-tenant `retention_policies` table (4 categories:
  `student_identity`, `staff_identity`, `financial_records`,
  `academic_records`), editable from **Admin -> Data Retention** in the
  app (permission `data_retention.manage`), plus
  `apps/cloud-api/scripts/run-retention.ts`, a standalone script that
  anonymizes departed students'/staff's name, contact, address,
  government-ID, and photo/document fields once they're past their
  tenant's configured retention window (`students.status IN ('withdrawn',
  'alumni')` / `staff.status IN ('relieved', 'terminated', 'inactive')`,
  gated on `date_of_leaving`). It's idempotent (marks each row
  `anonymized_at`) and dry-run by default:
  ```
  pnpm --filter cloud-api retention:run              # preview, every tenant
  pnpm --filter cloud-api retention:run --execute     # actually sweep
  ```
  This is **not** wired to a cron job -- run it by hand (or from your own
  scheduler) on whatever cadence you decide, after reading its dry-run
  output first every time.
- **What's deliberately out of scope**: `financial_records` (payroll, fee
  payments) and `academic_records` (exam marks) are seeded
  `is_active: false` and never swept by the script. Their correct
  retention periods depend on the Income Tax Act, Companies Act, and your
  state education board's rules -- confirm real numbers with your own CA/
  compliance advisor, update the `retention_years` value for that category
  from the admin page, and only then flip `is_active` to `true` directly
  in the database (there's no UI toggle for this on purpose -- see the
  script's own comments for why).
- **Known gap**: a relieved staff member's `users` login row is untouched
  by the sweep -- deciding whether/when to deactivate that login is an
  access-control question, not purely a data-erasure one, and needs its
  own follow-up.

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
  setting `CORS_ALLOWED_ORIGINS` (see Security basics above) is a one-line
  fix and easy to forget precisely because an open CORS config doesn't
  break anything visibly. Set `TRUST_PROXY=1` in the same deploy, or the
  rate limiter will bucket every real client behind your reverse proxy
  together instead of by their actual IP.

## Suggested immediate next steps, in order

1. Stand up cloud-api on a real VM with HTTPS + automated Postgres backups.
2. Deploy `apps/web`'s static build to a real host and domain, with
   `VITE_API_BASE_URL` pointed at cloud-api, then set
   `CORS_ALLOWED_ORIGINS` (see Security basics above) and `TRUST_PROXY=1`
   for that domain.
3. Build the minimal manual tenant-provisioning path (random UUIDs, no more
   hardcoded demo tenant) and an admin-triggered password reset.
4. ~~Add login rate-limiting.~~ **Done** -- see Security basics above.
   (Audit logging itself is done too -- see above.)
5. Get a privacy policy/ToS drafted (DPDP-aware) and a one-page service
   agreement.
6. Pilot with one real school, watching closely, before taking on a second.
