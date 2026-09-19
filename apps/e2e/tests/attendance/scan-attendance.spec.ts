import { expect, test } from "@playwright/test";

import { setupAcademicFixture } from "../../fixtures/academic-fixture.js";
import { apiContextFor, createAndEnrollTestStudent, loginViaApi } from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";

test.use({ storageState: authFilePath("branchAdmin") });

// A headless browser has no real camera, so this drives the manual "enter
// code" fallback -- which shares submitToken with the camera path, so it
// exercises the same server-side scan/idempotency logic end to end.
test("scan attendance: a QR token marks present once, then reports already-marked on rescan", async ({ page }) => {
  const suffix = Date.now();
  const setupAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(setupAuth.accessToken);
  const fixture = await setupAcademicFixture(api, suffix);

  const studentName = `E2EScanStudent${suffix}`;
  const studentId = await createAndEnrollTestStudent(api, {
    branchId: fixture.branchId,
    academicSessionId: fixture.sessionId,
    classId: fixture.classId,
    sectionId: fixture.sectionId,
    firstName: studentName,
  });

  const qrRes = await api.get(`/students/${studentId}/qr-code`);
  expect(qrRes.ok()).toBe(true);
  const { token } = (await qrRes.json()) as { token: string };
  await api.dispose();

  await page.goto("/attendance/scan");
  await page.getByRole("button", { name: "Student", exact: true }).click();

  await page.locator("#manual-code").fill(token);
  await page.getByRole("button", { name: "Submit" }).click();

  const marked = page.getByText(new RegExp(`${studentName}.*marked present`));
  await expect(marked).toBeVisible();
  await expect(page.getByText("Marked:").locator("..").getByText("1", { exact: true })).toBeVisible();

  // Resubmitting the same token (a manual submit is never debounced, only
  // the camera's continuous decode loop is) must be idempotent server-side.
  await page.locator("#manual-code").fill(token);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText(new RegExp(`${studentName}.*already marked present today`))).toBeVisible();
});
