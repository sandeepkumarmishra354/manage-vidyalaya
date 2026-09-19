import { expect, test } from "@playwright/test";

import { authFilePath } from "../../fixtures/personas.js";
import { switchBranch } from "../../fixtures/ui-helpers.js";

// front_desk holds admissions.create/confirm + students.create/edit --
// exactly the role that runs this flow in a real school.
test.use({ storageState: authFilePath("frontDesk") });

test("create an admission and confirm it", async ({ page }) => {
  const studentName = `E2EAdmission${Date.now()}`;

  await page.goto("/students");
  await switchBranch(page, "North Campus");

  await page.getByRole("button", { name: "New Admission" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByLabel("First name").fill(studentName);

  await page.getByRole("tab", { name: "Guardian" }).click();
  await page.getByLabel("Full name").fill(`${studentName} Guardian`);

  await page.getByRole("button", { name: "Save admission" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // The list re-fetches on close; search for the new applied student.
  await page.getByPlaceholder("Search by name or admission number...").fill(studentName);
  await expect(page.getByText(studentName)).toBeVisible();

  await page.getByText(studentName).click();
  await expect(page).toHaveURL(/\/students\/[^/]+$/);
  await expect(page.getByText("Admission not yet confirmed")).toBeVisible();

  await page.getByRole("button", { name: "Confirm admission" }).click();
  await expect(page.getByText("Admission not yet confirmed")).not.toBeVisible();
});
