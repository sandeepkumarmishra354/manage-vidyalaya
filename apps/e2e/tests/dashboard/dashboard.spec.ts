import { expect, test } from "@playwright/test";

import { setupAcademicFixture } from "../../fixtures/academic-fixture.js";
import { apiContextFor, createTestStudent, loginViaApi } from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";
import { switchBranch } from "../../fixtures/ui-helpers.js";

test.use({ storageState: authFilePath("branchAdmin") });

test("dashboard: an unconfirmed admission surfaces in the Needs Attention widget", async ({ page }) => {
  const suffix = Date.now();
  const setupAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(setupAuth.accessToken);
  const fixture = await setupAcademicFixture(api, suffix);

  async function pendingAdmissionsCount() {
    const res = await api.get(`dashboard/needs-attention?branch_id=${fixture.branchId}`);
    const body = (await res.json()) as { pending_admissions?: { total_count: number } };
    return body.pending_admissions?.total_count ?? 0;
  }

  const before = await pendingAdmissionsCount();

  const studentName = `E2EPendingAdmission${suffix}`;
  // Deliberately left unconfirmed (status stays "applied"). The section is
  // capped to its 5 oldest items (ORDER BY updated_at ASC), so this run's
  // own student isn't guaranteed to be in the visible list once other test
  // runs have left pending admissions behind -- assert on the count
  // instead of the specific row, which is robust either way.
  await createTestStudent(api, { branchId: fixture.branchId, academicSessionId: fixture.sessionId, firstName: studentName });

  await page.goto("/");
  await switchBranch(page, "North Campus");

  await expect(page.getByText("Needs Attention")).toBeVisible();
  // Two levels up: the label sits in a header row that's a sibling of the
  // links list, both children of the section's outer wrapper div.
  const section = page.getByText("Pending admissions").locator("../..");
  await expect(section).toBeVisible();

  await expect(async () => {
    expect(await pendingAdmissionsCount()).toBe(before + 1);
  }).toPass({ timeout: 10_000 });

  // Any link in the section (a row, or "+N more") goes to /students.
  await section.locator("a").first().click();
  await expect(page).toHaveURL(/\/students/);
  await api.dispose();
});
