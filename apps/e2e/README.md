# E2E test suite

Playwright end-to-end tests covering multi-branch and multi-role flows across the whole app, ahead of onboarding real schools. See `docs/production-readiness.md` for how this fits into the overall release checklist.

## Running locally

```sh
pnpm test:e2e          # from the repo root -- starts both dev servers automatically
# or
pnpm --filter e2e test
pnpm --filter e2e test:ui   # interactive UI mode
```

Postgres must already be running locally (`pg_ctlcluster 16 main start`) with the demo tenant seeded (`pnpm --filter cloud-api seed`) before running the suite -- `playwright.config.ts`'s `webServer` config starts the cloud-api and web dev servers itself (and reuses them if you already have `pnpm dev` running), but it does not start Postgres or run migrations/seed.

## Personas

`apps/cloud-api/scripts/seed.ts` idempotently seeds these logins into the demo tenant (`admin@demo.vidyalaya.in`'s tenant). All share the password `vidyalaya-qa-2026` except the pre-existing super_admin login. See `fixtures/personas.ts` for the canonical list used by tests.

| Persona | Email | Role | Branch | Notes |
|---|---|---|---|---|
| `superAdmin` | `admin@demo.vidyalaya.in` | super_admin | tenant-wide | password `vidyalaya-demo`; pre-existing |
| `branchAdmin` | `qa.branchadmin@demo.vidyalaya.in` | branch_admin | tenant-wide | |
| `accountant` | `qa.accountant@demo.vidyalaya.in` | accountant | tenant-wide | |
| `frontDesk` | `qa.frontdesk@demo.vidyalaya.in` | front_desk | tenant-wide | |
| `classTeacher` | `qa.classteacher@demo.vidyalaya.in` | teacher | tenant-wide | additive-auth setup (class-teacher-of-a-section) is wired by the E2E suite's own test setup, not seed.ts -- see Batch 2's academic ops tests |
| `subjectTeacher` | `qa.subjectteacher@demo.vidyalaya.in` | teacher | tenant-wide | additive-auth setup (subject assignment) likewise wired by the suite itself |

None of the five `qa.*` personas have a `branch_id` pinned on their login, so each can switch between **Main Campus** (the original demo branch -- real-looking data, kept pristine for human demos) and **North Campus** (a second, seeded branch that doubles as this suite's sandbox for anything that creates/mutates data: students, invoices, payroll runs, etc.) via the header's branch selector, exactly like a real multi-branch school admin would.

## Structure

- `fixtures/personas.ts` -- the persona table above, plus `authFilePath(name)` resolving each persona's saved Playwright `storageState`.
- `fixtures/global-setup.ts` -- logs in every persona once via a direct API call (faster/less flaky than driving the login form per test) and saves `storageState` JSON per persona under `.auth/` (gitignored -- contains real tokens).
- `fixtures/api-client.ts` -- thin helpers for API-level test-data setup/teardown when a test's actual subject is something else (e.g. creating a student via API before testing that a *different* persona can/can't see it).
- `tests/` -- organized by area: `isolation/` (cross-branch, cross-tenant, and route-permission boundaries), `academic/` (admissions, attendance, exams, timetable, promotion, school calendar), `fees/` (invoice lifecycle, discounts, the student-fee-override regression), `payroll/` (full run lifecycle including the payroll-run-reuse regression), `expenses/`, `library/`, `transport/`, `houses/`, `documents/`, `attendance/` (QR scan), `dashboard/`, and `admin/` (roles, users, audit log, master data).

A spec file picks its persona via `test.use({ storageState: authFilePath("branchAdmin") })`; a file that needs to switch personas mid-test (e.g. isolation/permission tests) uses `browser.newContext({ storageState: ... })` per persona instead.
