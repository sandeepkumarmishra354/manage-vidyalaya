import { expect, test } from "@playwright/test";

import { setupAcademicFixture } from "../../fixtures/academic-fixture.js";
import { apiContextFor, createAndEnrollTestStudent, loginViaApi } from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";

test.use({ storageState: authFilePath("branchAdmin") });

test("houses: assign a student to a house, award points, and see the leaderboard update", async ({ page }) => {
  const suffix = Date.now();
  const setupAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(setupAuth.accessToken);
  const fixture = await setupAcademicFixture(api, suffix);

  const studentName = `E2EHouseStudent${suffix}`;
  const studentId = await createAndEnrollTestStudent(api, {
    branchId: fixture.branchId,
    academicSessionId: fixture.sessionId,
    classId: fixture.classId,
    sectionId: fixture.sectionId,
    firstName: studentName,
  });

  const houseName = `E2EHouse${suffix}`;
  const houseRes = await api.post("houses", { data: { branch_id: fixture.branchId, name: houseName, color: "#ff0000" } });
  expect(houseRes.ok()).toBe(true);
  await api.dispose();

  await page.goto(`/students/${studentId}`);
  await page.getByRole("tab", { name: "Academic" }).click();

  await page.getByRole("combobox").filter({ hasText: "Assign a house" }).click();
  await page.getByRole("option", { name: houseName }).click();
  await expect(page.getByText(houseName).first()).toBeVisible();

  await page.goto("/houses");
  await page.getByRole("tab", { name: "Points" }).click();

  await page.getByRole("combobox").filter({ hasText: "Select house" }).click();
  await page.getByRole("option", { name: houseName }).click();
  await page.locator("#points").fill("15");
  await page.locator("#reason").fill("E2E test points");
  await page.getByRole("button", { name: "Award" }).click();

  const eventRow = page.getByRole("row", { name: new RegExp(houseName) });
  await expect(eventRow).toBeVisible();
  await expect(eventRow.getByText("+15")).toBeVisible();

  await page.getByRole("tab", { name: "Leaderboard" }).click();
  // Houses have no delete endpoint (a real school rarely retires one), so
  // this test's house -- and every other run's -- persists across runs.
  // Scope assertions to this house's own card, not global page text, since
  // another accumulated house could coincidentally also show "15 pts".
  const houseCard = page.getByText(houseName).locator("../..");
  await expect(houseCard).toBeVisible();
  await expect(houseCard.getByText("15 pts")).toBeVisible();
  await expect(houseCard.getByText("1 students")).toBeVisible();
});
