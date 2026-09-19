import { expect, test } from "@playwright/test";

import { setupAcademicFixture } from "../../fixtures/academic-fixture.js";
import {
  apiContextFor,
  createAndEnrollTestStudent,
  createTestFeeStructure,
  generateInvoicesForStructure,
  loginViaApi,
} from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";
import { switchBranch } from "../../fixtures/ui-helpers.js";

test.use({ storageState: authFilePath("accountant") });

// Assigning a discount with "apply to existing invoices" checked must
// actually recompute the student's already-generated invoice, not just
// record the assignment -- this exercises fees.service.ts's
// reapplyDiscountsForStudent path directly through the UI.
test("assigning a flat discount to a student reduces their outstanding invoice", async ({ page }) => {
  const suffix = Date.now();
  const setupAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(setupAuth.accessToken);
  const fixture = await setupAcademicFixture(api, suffix);

  const studentName = `E2EDiscountStudent${suffix}`;
  const studentId = await createAndEnrollTestStudent(api, {
    branchId: fixture.branchId,
    academicSessionId: fixture.sessionId,
    classId: fixture.classId,
    sectionId: fixture.sectionId,
    firstName: studentName,
  });

  const structureId = await createTestFeeStructure(api, {
    branchId: fixture.branchId,
    classId: fixture.classId,
    academicSessionId: fixture.sessionId,
    name: `E2EDiscountFeeStructure${suffix}`,
    amountRupees: 5000,
  });
  await generateInvoicesForStructure(api, structureId);

  async function summary() {
    const res = await api.get(`/fee-invoices/student/${studentId}/summary`);
    return (await res.json()) as { total_due: number; invoices: { discount_amount: number; amount_due: number }[] };
  }

  expect((await summary()).total_due).toBe(500_000);

  const discountName = `E2EDiscount${suffix}`;

  await page.goto("/fees");
  await switchBranch(page, "North Campus");
  await page.getByRole("tab", { name: "Discounts" }).click();

  const discountForm = page.locator("form").filter({ has: page.getByPlaceholder("e.g. Sibling discount") });
  await discountForm.getByPlaceholder("e.g. Sibling discount").fill(discountName);
  await discountForm.getByRole("combobox").filter({ hasText: "Percentage" }).click();
  await page.getByRole("option", { name: "Flat amount" }).click();
  await discountForm.locator('input[type="number"]').fill("1000");
  await discountForm.getByRole("button", { name: "Add" }).click();

  const discountRow = page.getByRole("row", { name: new RegExp(discountName) });
  await expect(discountRow).toBeVisible();

  await discountRow.getByRole("button", { name: "Manage students" }).click();
  const dialog = page.getByRole("dialog", { name: new RegExp(discountName) });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("combobox").filter({ hasText: "Select student" }).click();
  await page.getByRole("option", { name: new RegExp(studentName) }).click();
  await dialog.locator('input[type="checkbox"]').check();
  await dialog.getByRole("button", { name: "Assign" }).click();

  await expect(dialog.getByText(studentName)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await expect(async () => {
    const s = await summary();
    expect(s.total_due).toBe(400_000);
    expect(s.invoices[0]?.discount_amount).toBe(100_000);
    expect(s.invoices[0]?.amount_due).toBe(400_000);
  }).toPass({ timeout: 10_000 });

  await api.dispose();
});
