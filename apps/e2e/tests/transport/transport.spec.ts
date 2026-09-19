import { expect, test } from "@playwright/test";

import { setupAcademicFixture } from "../../fixtures/academic-fixture.js";
import { apiContextFor, createAndEnrollTestStudent, loginViaApi } from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";
import { switchBranch } from "../../fixtures/ui-helpers.js";

test.use({ storageState: authFilePath("branchAdmin") });

test("transport: create a route with a stop, assign a student, and see them on the roster", async ({ page }) => {
  const suffix = Date.now();
  const setupAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(setupAuth.accessToken);
  const fixture = await setupAcademicFixture(api, suffix);

  const studentName = `E2ETransportStudent${suffix}`;
  await createAndEnrollTestStudent(api, {
    branchId: fixture.branchId,
    academicSessionId: fixture.sessionId,
    classId: fixture.classId,
    sectionId: fixture.sectionId,
    firstName: studentName,
  });
  await api.dispose();

  const routeName = `E2ERoute${suffix}`;
  const stopName = `E2EStop${suffix}`;

  await page.goto("/transport");
  await switchBranch(page, "North Campus");

  await page.getByRole("button", { name: "New route" }).click();
  const newRouteDialog = page.getByRole("dialog", { name: "New route" });
  // The "Name" label isn't programmatically associated with its input (no
  // htmlFor/id), so target it positionally -- it's the first text input.
  await newRouteDialog.locator("input").first().fill(routeName);
  await newRouteDialog.getByRole("button", { name: "Add route" }).click();
  await expect(newRouteDialog).not.toBeVisible();

  await page.getByPlaceholder("Search by name or vehicle #...").fill(routeName);
  await page.getByRole("button", { name: new RegExp(routeName) }).click();
  await expect(page.getByText(routeName).first()).toBeVisible();

  await page.getByPlaceholder("e.g. Gandhi Chowk").fill(stopName);
  await page.getByRole("button", { name: "Add stop" }).click();
  await expect(page.getByText(stopName).first()).toBeVisible();

  await page.getByRole("combobox").filter({ hasText: "Select student" }).click();
  await page.getByRole("option", { name: new RegExp(studentName) }).click();
  await page.getByRole("combobox").filter({ hasText: "Select stop" }).click();
  await page.getByRole("option", { name: stopName }).click();
  await page.getByRole("button", { name: "Assign", exact: true }).click();

  await expect(page.getByText("Students on this route")).toBeVisible();
  const rosterEntry = page.locator("li").filter({ hasText: studentName });
  await expect(rosterEntry).toBeVisible();
  await expect(rosterEntry.getByText(stopName)).toBeVisible();
});
