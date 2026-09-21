import { expect, test } from "@playwright/test";

import { setupAcademicFixture } from "../../fixtures/academic-fixture.js";
import { apiContextFor, createAndEnrollTestStudent, loginViaApi } from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";

// The class teacher persona has no flat attendance.mark permission --
// this exercises ScopedAccessService's additive path (class-teacher-of-
// the-section) instead, confirmed by the "Select class & date" -> "Mark
// all present" -> "Save attendance" flow actually being available to
// them at all.
test.use({ storageState: authFilePath("classTeacher") });

test("a class teacher (no flat attendance.mark) can mark attendance for their own section", async ({ page }) => {
  const suffix = Date.now();
  const auth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(auth.accessToken);
  const fixture = await setupAcademicFixture(api, suffix);

  const studentName = `E2EAttendanceStudent${suffix}`;
  await createAndEnrollTestStudent(api, {
    branchId: fixture.branchId,
    academicSessionId: fixture.sessionId,
    classId: fixture.classId,
    sectionId: fixture.sectionId,
    firstName: studentName,
  });
  await api.dispose();

  await page.goto("/attendance");

  await page.getByRole("combobox").filter({ hasText: "Select class" }).click();
  await page.getByRole("option", { name: new RegExp(`E2E Class ${suffix}`) }).click();
  await page.getByRole("combobox").filter({ hasText: /section/i }).click();
  await page.getByRole("option", { name: "A", exact: true }).click();

  // The roster renders twice in the DOM (a desktop table + a mobile card
  // list, toggled with responsive `hidden` classes rather than removed) --
  // .first() picks whichever one the viewport shows.
  const dailyPanel = page.getByRole("tabpanel", { name: "Daily" });
  await expect(dailyPanel.getByText(studentName).first()).toBeVisible();
  await page.getByRole("button", { name: "Mark all present" }).click();
  await page.getByRole("button", { name: "Save attendance" }).click();

  await expect(page.getByRole("button", { name: "Save attendance" })).not.toBeDisabled({ timeout: 10_000 });
});
