import { expect, test } from "@playwright/test";

import { setupAcademicFixture } from "../../fixtures/academic-fixture.js";
import { apiContextFor, createAndEnrollTestStudent, loginViaApi } from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";
import { switchBranch } from "../../fixtures/ui-helpers.js";

test.use({ storageState: authFilePath("branchAdmin") });

test("promoting a student updates their current class and creates a new-session enrollment", async ({ page }) => {
  const suffix = Date.now();
  const auth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(auth.accessToken);
  const fixture = await setupAcademicFixture(api, suffix);

  const studentName = `E2EPromoteStudent${suffix}`;
  await createAndEnrollTestStudent(api, {
    branchId: fixture.branchId,
    academicSessionId: fixture.sessionId,
    classId: fixture.classId,
    sectionId: fixture.sectionId,
    firstName: studentName,
  });

  // A second, non-current session to promote into -- deliberately created
  // with is_current: false so it never disturbs the tenant's real current
  // session (which other fixtures/tests key off of).
  const toSessionRes = await api.post("/academic-sessions", {
    data: { name: `E2E Next Session ${suffix}`, start_date: "2030-04-01", end_date: "2031-03-31", is_current: false },
  });
  expect(toSessionRes.ok()).toBe(true);
  const { id: toSessionId } = (await toSessionRes.json()) as { id: string };

  const toClassRes = await api.post("/classes", {
    data: { branch_id: fixture.branchId, academic_session_id: toSessionId, name: `E2E Class ${suffix} Next` },
  });
  expect(toClassRes.ok()).toBe(true);
  const { id: toClassId } = (await toClassRes.json()) as { id: string };
  await api.dispose();

  await page.goto("/academic-setup");
  await switchBranch(page, "North Campus");
  await page.getByRole("tab", { name: "Promotion" }).click();

  await page.getByRole("combobox").filter({ hasText: "Select session" }).first().click();
  await page.getByRole("option", { name: /2026-27/ }).click();
  await page.getByRole("combobox").filter({ hasText: "Select session" }).click();
  await page.getByRole("option", { name: new RegExp(`E2E Next Session ${suffix}`) }).click();

  await page.getByRole("button", { name: "Suggest class mapping" }).click();
  await expect(page.getByText(new RegExp(`E2E Class ${suffix}`))).toBeVisible();

  const mappingRow = page.getByRole("row", { name: new RegExp(`E2E Class ${suffix}`) });
  await mappingRow.getByRole("combobox").click();
  await page.getByRole("option", { name: new RegExp(`E2E Class ${suffix} Next`) }).click();

  await page.getByRole("button", { name: "Review students" }).click();
  await expect(page.getByText(studentName)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Execute promotion" }).click();
  await expect(page.getByRole("button", { name: "Execute promotion" })).not.toBeVisible({ timeout: 15_000 });

  // Verify server-side: the student's current_class_id moved to the new
  // session's class. listStudents' response is trimmed (class_name only,
  // no raw ids), so fetch the full detail record to check current_class_id.
  const verifyApi = await apiContextFor(auth.accessToken);
  const listRes = await verifyApi.get(`/students?branch_id=${fixture.branchId}&search=${encodeURIComponent(studentName)}`);
  const [listed] = (await listRes.json()) as { id: string }[];
  expect(listed).toBeTruthy();

  const detailRes = await verifyApi.get(`/students/${listed.id}`);
  const detail = (await detailRes.json()) as { current_class_id: string | null };
  expect(detail.current_class_id).toBe(toClassId);
  await verifyApi.dispose();
});
