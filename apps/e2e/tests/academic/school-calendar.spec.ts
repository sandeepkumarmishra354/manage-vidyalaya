import { expect, test } from "@playwright/test";

import { apiContextFor, getBranchIdByName, getCurrentAcademicSessionId, loginViaApi } from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";
import { switchBranch } from "../../fixtures/ui-helpers.js";

test.use({ storageState: authFilePath("branchAdmin") });

test("school calendar: a named holiday appears in the list and can be removed", async ({ page }) => {
  const suffix = Date.now();
  const setupAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(setupAuth.accessToken);
  const branchId = await getBranchIdByName(api, "North Campus");
  const sessionId = await getCurrentAcademicSessionId(api);

  const holidayName = `E2EHoliday${suffix}`;
  // A fixed, far-future date within no real school_calendars coverage gap
  // concern here -- unlike payroll periods, a named holiday only ever
  // matters for the session it's attached to, so a plain future date is
  // fine and doesn't need run-unique scoping.
  const holidayDate = "2031-03-17";
  const holidayRes = await api.post("/school-calendar/holidays", {
    data: { branch_id: branchId, academic_session_id: sessionId, date: holidayDate, name: holidayName, type: "holiday" },
  });
  expect(holidayRes.ok()).toBe(true);
  await api.dispose();

  await page.goto("/academic-setup");
  await switchBranch(page, "North Campus");
  await page.getByRole("tab", { name: "School Calendar" }).click();

  const holidayRow = page.getByRole("row", { name: new RegExp(holidayName) });
  await expect(holidayRow).toBeVisible();
  await expect(holidayRow.getByText(holidayDate)).toBeVisible();
  await expect(holidayRow.getByText("Full holiday")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await holidayRow.getByRole("button").last().click();
  await expect(holidayRow).not.toBeVisible();
});
