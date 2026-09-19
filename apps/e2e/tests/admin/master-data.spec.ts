import { expect, test } from "@playwright/test";

import { authFilePath } from "../../fixtures/personas.js";

test.use({ storageState: authFilePath("branchAdmin") });

test("master data: add, rename, and delete an expense category lookup value", async ({ page }) => {
  const suffix = Date.now();
  const name = `E2ECategory${suffix}`;
  const renamed = `E2ECategoryRenamed${suffix}`;

  await page.goto("/admin/master-data");
  await page.getByRole("button", { name: "Expense Category" }).click();

  await page.getByPlaceholder("New expense category value").fill(name);
  await page.getByRole("button", { name: "Add" }).click();

  const badge = page.getByText(name, { exact: true }).locator("..");
  await expect(badge).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept(renamed));
  await badge.getByRole("button").first().click();
  await expect(page.getByText(renamed, { exact: true })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).not.toBeVisible();

  const renamedBadge = page.getByText(renamed, { exact: true }).locator("..");
  page.once("dialog", (dialog) => dialog.accept());
  await renamedBadge.getByRole("button").last().click();
  await expect(page.getByText(renamed, { exact: true })).not.toBeVisible();
});
