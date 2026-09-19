import { expect, test } from "@playwright/test";

import { setupAcademicFixture } from "../../fixtures/academic-fixture.js";
import { apiContextFor, createAndEnrollTestStudent, loginViaApi } from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";
import { switchBranch } from "../../fixtures/ui-helpers.js";

// The subject teacher persona has no flat exams.enter_marks... it does
// hold exams.enter_marks (part of the `teacher` role), but is only
// assigned to ONE subject -- this exercises that the marks-entry subject
// dropdown is scoped to just their assignment (GET /exams/:id/my-teaching-
// assignments), the additive-auth path, not a flat "can enter marks for
// any subject" grant.
test.use({ storageState: authFilePath("subjectTeacher") });

test("a subject-assigned teacher can enter marks for their own subject", async ({ page }) => {
  const suffix = Date.now();
  const auth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(auth.accessToken);
  const fixture = await setupAcademicFixture(api, suffix);

  const studentName = `E2EExamStudent${suffix}`;
  await createAndEnrollTestStudent(api, {
    branchId: fixture.branchId,
    academicSessionId: fixture.sessionId,
    classId: fixture.classId,
    sectionId: fixture.sectionId,
    firstName: studentName,
  });

  const examName = `E2EExam${suffix}`;
  const examRes = await api.post("/exams", {
    data: { branch_id: fixture.branchId, academic_session_id: fixture.sessionId, class_id: fixture.classId, name: examName },
  });
  expect(examRes.ok()).toBe(true);
  await api.dispose();

  await page.goto("/exams");
  await switchBranch(page, "North Campus");
  await page.getByText(examName).click();

  await page.getByRole("tab", { name: "Enter marks" }).click();
  await page.getByRole("combobox").filter({ hasText: "Select subject" }).click();
  await page.getByRole("option", { name: new RegExp(`E2E Subject ${suffix}`) }).click();

  const row = page.getByRole("row", { name: new RegExp(studentName) });
  await row.locator('input[type="number"]').first().fill("100");
  await row.locator('input[type="number"]').nth(1).fill("85");

  await page.getByRole("button", { name: "Save marks" }).click();
  await expect(page.getByRole("button", { name: "Save marks" })).not.toBeDisabled({ timeout: 10_000 });
});
