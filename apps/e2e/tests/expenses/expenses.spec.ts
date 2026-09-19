import { expect, test } from "@playwright/test";

import { authFilePath } from "../../fixtures/personas.js";
import { switchBranch } from "../../fixtures/ui-helpers.js";

test.use({ storageState: authFilePath("accountant") });

test("expense CRUD: add with receipt, appears in list and summary, then delete", async ({ page }) => {
  const suffix = Date.now();
  const description = `E2EExpense${suffix}`;

  await page.goto("/expenses");
  await switchBranch(page, "North Campus");

  await page.getByRole("button", { name: "Add expense" }).click();
  const dialog = page.getByRole("dialog", { name: "Add expense" });
  await expect(dialog).toBeVisible();

  await dialog.locator("#exp-description").fill(description);
  await dialog.locator("#exp-amount").fill("1250");
  await dialog.locator("#exp-vendor").fill("E2E Vendor");
  await dialog.locator("#exp-receipt").setInputFiles({
    name: "receipt.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("e2e test receipt"),
  });
  await dialog.getByRole("button", { name: "Add expense" }).click();
  await expect(dialog).not.toBeVisible();

  const expenseRow = page.getByRole("row", { name: new RegExp(description) });
  await expect(expenseRow).toBeVisible();
  await expect(expenseRow.getByText("E2E Vendor")).toBeVisible();
  await expect(expenseRow.getByText("₹1,250.00")).toBeVisible();

  // The receipt-attached row gets a download (paperclip) button in
  // addition to delete -- two ghost buttons instead of one.
  await expect(expenseRow.getByRole("button")).toHaveCount(2);

  await expect(page.getByText("Total expenses")).toBeVisible();
  await expect(page.getByText("₹1,250.00").first()).toBeVisible();

  // Delete -- no confirm dialog on this page's delete action.
  await expenseRow.getByRole("button").last().click();
  await expect(expenseRow).not.toBeVisible();
});
