import { expect, test } from "@playwright/test";

import { authFilePath, type PersonaName } from "../../fixtures/personas.js";

// Parametrized sweep over every permission-gated static route in
// apps/web/src/App.tsx, checked against each QA persona's actual role
// permissions (mirrored from apps/cloud-api/src/common/permission-
// catalog.ts's SYSTEM_ROLE_PERMISSIONS -- kept as a literal list here
// rather than imported, since this package intentionally has no
// dependency on cloud-api's source). Catches any route left ungated, or
// gated with the wrong permission key, cheaply and in one file: a
// permitted route must render its real content, a forbidden route must
// redirect back to "/" (RequirePermission's defense-in-depth behavior,
// see App.tsx), never show the gated content.
//
// Dynamic (":id") and no-permission/any-permission routes are
// deliberately out of scope here -- this file is about the common flat
// RequirePermission case across the whole route table.

interface GatedRoute {
  path: string;
  permission: string;
}

const GATED_ROUTES: GatedRoute[] = [
  { path: "/students", permission: "students.view" },
  { path: "/alumni", permission: "students.view" },
  { path: "/attendance", permission: "attendance.view" },
  { path: "/fees", permission: "fees.view" },
  { path: "/exams", permission: "exams.view" },
  { path: "/timetable", permission: "timetable.view" },
  { path: "/library", permission: "library.view" },
  { path: "/transport", permission: "transport.view" },
  { path: "/houses", permission: "houses.view" },
  { path: "/academic-setup", permission: "academic_setup.view" },
  { path: "/staff", permission: "staff.view" },
  { path: "/admin/leave-requests", permission: "staff_leave.manage" },
  { path: "/payroll", permission: "payroll.view" },
  { path: "/expenses", permission: "expenses.view" },
  { path: "/admin/master-data", permission: "master_data.view" },
  { path: "/admin/roles", permission: "roles.manage" },
  { path: "/admin/users", permission: "users.manage" },
  { path: "/admin/audit-log", permission: "audit.view" },
];

// Mirrors SYSTEM_ROLE_PERMISSIONS for the 4 non-admin QA personas (both
// teacher logins share the same "teacher" role/permission set).
const PERSONA_PERMISSIONS: Partial<Record<PersonaName, Set<string>>> = {
  accountant: new Set([
    "fees.view",
    "fees.manage_structures",
    "fees.generate_invoices",
    "fees.void_invoice",
    "fees.record_payment",
    "fees.manage_discounts",
    "payroll.view",
    "payroll.generate",
    "payroll.finalize",
    "students.view",
    "expenses.view",
    "expenses.manage",
  ]),
  frontDesk: new Set([
    "admissions.view",
    "admissions.create",
    "admissions.confirm",
    "students.view",
    "students.create",
    "students.edit",
    "library.view",
    "library.manage_issues",
  ]),
  classTeacher: new Set([
    "attendance.mark",
    "attendance.view",
    "exams.view",
    "exams.enter_marks",
    "students.view",
    "staff_attendance.view",
    "payroll.view_own",
    "timetable.view",
  ]),
  subjectTeacher: new Set([
    "attendance.mark",
    "attendance.view",
    "exams.view",
    "exams.enter_marks",
    "students.view",
    "staff_attendance.view",
    "payroll.view_own",
    "timetable.view",
  ]),
};

for (const [personaName, permissions] of Object.entries(PERSONA_PERMISSIONS) as [PersonaName, Set<string>][]) {
  test.describe(`route permission boundaries: ${personaName}`, () => {
    test.use({ storageState: authFilePath(personaName) });

    for (const route of GATED_ROUTES) {
      const permitted = permissions.has(route.permission);

      test(`${route.path} is ${permitted ? "reachable" : "forbidden"}`, async ({ page }) => {
        await page.goto(route.path);
        await page.waitForLoadState("networkidle");

        if (permitted) {
          await expect(page).toHaveURL(new RegExp(`${route.path.replace(/\//g, "\\/")}$`));
        } else {
          await expect(page).toHaveURL(/\/$/);
        }
      });
    }
  });
}

test.describe("route permission boundaries: branchAdmin (everything but roles.manage)", () => {
  test.use({ storageState: authFilePath("branchAdmin") });

  for (const route of GATED_ROUTES) {
    const permitted = route.permission !== "roles.manage";

    test(`${route.path} is ${permitted ? "reachable" : "forbidden"}`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");

      if (permitted) {
        await expect(page).toHaveURL(new RegExp(`${route.path.replace(/\//g, "\\/")}$`));
      } else {
        await expect(page).toHaveURL(/\/$/);
      }
    });
  }
});

test.describe("route permission boundaries: superAdmin (everything)", () => {
  test.use({ storageState: authFilePath("superAdmin") });

  for (const route of GATED_ROUTES) {
    test(`${route.path} is reachable`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(new RegExp(`${route.path.replace(/\//g, "\\/")}$`));
    });
  }
});
