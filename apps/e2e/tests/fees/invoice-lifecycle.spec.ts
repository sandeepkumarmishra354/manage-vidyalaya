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

// Asserts the invoice's outstanding-balance arithmetic explicitly after
// every transition (generate -> partial payment -> full payment ->
// reverse -> edit -> void), not just that each button reports success --
// this is the highest-consequence area in the app, a bug here is real
// financial harm to a customer.
test("invoice lifecycle: generate, partial pay, full pay, reverse, edit, void", async ({ page }) => {
  const suffix = Date.now();
  // Fixture/student/invoice setup needs academic_setup.manage_* and
  // staff.manage_assignments, which accountant doesn't hold -- use
  // super_admin for setup, accountant only for the actual UI flow under
  // test.
  const setupAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(setupAuth.accessToken);
  const fixture = await setupAcademicFixture(api, suffix);

  const studentName = `E2EFeeStudent${suffix}`;
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
    name: `E2EFeeStructure${suffix}`,
    amountRupees: 5000,
  });
  await generateInvoicesForStructure(api, structureId);

  async function summary() {
    const res = await api.get(`fee-invoices/student/${studentId}/summary`);
    const body = (await res.json()) as { total_due: number; total_paid: number };
    return { ...body, outstanding: body.total_due - body.total_paid };
  }

  expect((await summary()).total_due).toBe(500_000);
  expect((await summary()).total_paid).toBe(0);

  await page.goto("/fees");
  await switchBranch(page, "North Campus");
  await page.getByRole("tab", { name: "Invoices" }).click();

  const invoiceRow = page.getByRole("row", { name: new RegExp(studentName) });
  await invoiceRow.click();
  await expect(page.getByRole("dialog", { name: "Record payment" })).toBeVisible();
  await page.locator("#amount").fill("2000");
  await page.getByRole("button", { name: "Record payment" }).click();
  // A "Payment recorded" confirmation dialog follows the Record Payment
  // dialog -- must be dismissed too, or it keeps the rest of the page
  // aria-hidden (behind the modal focus trap), which makes every
  // subsequent role-based locator fail to resolve.
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  expect((await summary()).total_paid).toBe(200_000);
  expect((await summary()).outstanding).toBe(300_000);

  await invoiceRow.click();
  await page.locator("#amount").fill("3000");
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  expect((await summary()).total_paid).toBe(500_000);
  expect((await summary()).outstanding).toBe(0);

  // Reverse the second payment (₹3000) via the native prompt.
  await page.getByRole("tab", { name: "Payments" }).click();
  page.once("dialog", (dialog) => dialog.accept("no longer valid"));
  const paymentRows = page.getByRole("row", { name: new RegExp(studentName) });
  await paymentRows.last().getByRole("button").last().click();

  await expect(async () => {
    expect((await summary()).outstanding).toBe(300_000);
  }).toPass({ timeout: 10_000 });

  // Edit the invoice amount, reason required.
  await page.getByRole("tab", { name: "Invoices" }).click();
  await invoiceRow.getByRole("button").first().click();
  const editDialog = page.getByRole("dialog", { name: /Edit invoice/ });
  await expect(editDialog).toBeVisible();
  // Labels here aren't programmatically associated (no htmlFor/id), so
  // getByLabel can't match -- target inputs positionally within the
  // dialog instead: amount (number), due date (date), reason (text).
  await editDialog.locator('input[type="number"]').fill("6000");
  await editDialog.locator('input:not([type="number"]):not([type="date"])').fill("E2E test correction");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog", { name: /Edit invoice/ })).not.toBeVisible();

  expect((await summary()).total_due).toBe(600_000);

  // Void the invoice via the Record Payment dialog's footer action.
  page.once("dialog", (dialog) => dialog.accept("E2E test void"));
  await invoiceRow.click();
  await page.getByRole("button", { name: "Void invoice" }).click();

  await expect(async () => {
    const res = await api.get(`fee-invoices?branch_id=${fixture.branchId}`);
    const invoices = (await res.json()) as { student_id: string; status: string }[];
    const invoice = invoices.find((i) => i.student_id === studentId);
    expect(invoice?.status).toBe("voided");
  }).toPass({ timeout: 10_000 });

  await api.dispose();
});
