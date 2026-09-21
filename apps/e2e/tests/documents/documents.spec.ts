import { expect, test } from "@playwright/test";

import { setupAcademicFixture } from "../../fixtures/academic-fixture.js";
import { apiContextFor, createAndEnrollTestStudent, loginViaApi } from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";

test.use({ storageState: authFilePath("branchAdmin") });

test("student documents: upload a document, download it, then delete it", async ({ page }) => {
  const suffix = Date.now();
  const setupAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(setupAuth.accessToken);
  const fixture = await setupAcademicFixture(api, suffix);

  const studentName = `E2EDocStudent${suffix}`;
  const studentId = await createAndEnrollTestStudent(api, {
    branchId: fixture.branchId,
    academicSessionId: fixture.sessionId,
    classId: fixture.classId,
    sectionId: fixture.sectionId,
    firstName: studentName,
  });
  await api.dispose();

  const label = `E2EDoc${suffix}`;

  await page.goto(`/students/${studentId}`);
  await page.getByRole("tab", { name: "Documents" }).click();

  await page.getByRole("button", { name: "Add document" }).click();
  const dialog = page.getByRole("dialog", { name: "Add document" });
  await dialog.locator("#doc-label").fill(label);
  await dialog.locator("#doc-file").setInputFiles({
    name: "test-doc.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("e2e test document contents"),
  });

  await dialog.getByRole("button", { name: "Upload" }).click();
  await expect(dialog).not.toBeVisible();

  const docRow = page.getByRole("row", { name: new RegExp(label) });
  await expect(docRow).toBeVisible();
  await expect(docRow.getByText("test-doc.txt")).toBeVisible();

  // The download URL is cross-origin (cloud-api's port, not the web app's),
  // so the anchor's `download` attribute is ignored by the browser (a
  // cross-origin download attribute only downloads same-origin resources)
  // and it opens as a new tab instead of firing a "download" event.
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    docRow.getByRole("button").first().click(),
  ]);
  await popup.waitForLoadState();
  expect(popup.url()).toContain("/storage/objects/");
  await popup.close();

  await docRow.getByRole("button").last().click();
  await expect(docRow).not.toBeVisible();
});
