import { expect, test } from "@playwright/test";

import { apiContextFor, createAndEnrollTestStudent, loginViaApi } from "../../fixtures/api-client.js";
import { setupAcademicFixture } from "../../fixtures/academic-fixture.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";

test.use({ storageState: authFilePath("branchAdmin") });

test("library: add a book, issue it, then return it and see availability restored", async ({ page }) => {
  const suffix = Date.now();
  const setupAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(setupAuth.accessToken);
  const fixture = await setupAcademicFixture(api, suffix);

  const studentName = `E2ELibraryStudent${suffix}`;
  await createAndEnrollTestStudent(api, {
    branchId: fixture.branchId,
    academicSessionId: fixture.sessionId,
    classId: fixture.classId,
    sectionId: fixture.sectionId,
    firstName: studentName,
  });
  await api.dispose();

  const bookTitle = `E2EBook${suffix}`;

  await page.goto("/library");
  await page.getByRole("tab", { name: "Catalog" }).click();

  await page.locator("#book-title").fill(bookTitle);
  await page.locator("#book-author").fill("E2E Author");
  await page.locator("#book-copies").fill("1");
  await page.getByRole("button", { name: "Add" }).click();

  const bookRow = page.getByRole("row", { name: new RegExp(bookTitle) });
  await expect(bookRow).toBeVisible();
  await expect(bookRow.getByText("1 / 1")).toBeVisible();

  await page.getByRole("tab", { name: "Issue / Return" }).click();
  await page.getByRole("combobox").filter({ hasText: "Select book" }).click();
  await page.getByRole("option", { name: new RegExp(bookTitle) }).click();
  await page.getByRole("combobox").filter({ hasText: "Select student" }).click();
  await page.getByRole("option", { name: new RegExp(studentName) }).click();
  await page.getByRole("button", { name: "Issue" }).click();

  const issueRow = page.getByRole("row", { name: new RegExp(bookTitle) });
  await expect(issueRow).toBeVisible();
  await expect(issueRow.getByText(studentName)).toBeVisible();

  // Availability drops to 0/1 while issued.
  await page.getByRole("tab", { name: "Catalog" }).click();
  await expect(page.getByRole("row", { name: new RegExp(bookTitle) }).getByText("0 / 1")).toBeVisible();

  await page.getByRole("tab", { name: "Issue / Return" }).click();
  await page.getByRole("button", { name: "Mark returned" }).click();
  await expect(page.getByRole("row", { name: new RegExp(bookTitle) })).not.toBeVisible();

  await page.getByRole("tab", { name: "Catalog" }).click();
  await expect(page.getByRole("row", { name: new RegExp(bookTitle) }).getByText("1 / 1")).toBeVisible();
});
