import { expect, test } from "@playwright/test";

import {
  apiContextFor,
  createTestExpense,
  createTestStaff,
  createTestStudent,
  getBranchIdByName,
  getCurrentAcademicSessionId,
  loginViaApi,
} from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";
import { switchBranch } from "../../fixtures/ui-helpers.js";

// Proves data created in one branch never leaks into another when the
// same super_admin views a different branch -- the bug class this
// second, permanent branch exists to make cheap to test continuously.
// A row visible only on the branch it was created in is the expected,
// correct behavior; anything else here is a real tenant-isolation bug.

test.use({ storageState: authFilePath("superAdmin") });

const uniqueSuffix = Date.now();

test.describe("branch isolation", () => {
  test("a student created in North Campus is invisible from Main Campus", async ({ page }) => {
    const auth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
    const api = await apiContextFor(auth.accessToken);
    const name = `E2EStudent${uniqueSuffix}`;

    const northBranchId = await getBranchIdByName(api, "North Campus");
    const sessionId = await getCurrentAcademicSessionId(api);
    await createTestStudent(api, { branchId: northBranchId, academicSessionId: sessionId, firstName: name });
    await api.dispose();

    await page.goto("/students");
    await switchBranch(page, "Main Campus");
    await page.getByPlaceholder("Search by name or admission number...").fill(name);
    await expect(page.getByText(name)).not.toBeVisible();

    await switchBranch(page, "North Campus");
    await page.getByPlaceholder("Search by name or admission number...").fill(name);
    await expect(page.getByText(name)).toBeVisible();
  });

  test("a staff member created in North Campus is invisible from Main Campus", async ({ page }) => {
    const auth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
    const api = await apiContextFor(auth.accessToken);
    const name = `E2EStaff${uniqueSuffix}`;

    const northBranchId = await getBranchIdByName(api, "North Campus");
    await createTestStaff(api, { branchId: northBranchId, firstName: name });
    await api.dispose();

    await page.goto("/staff");
    await switchBranch(page, "Main Campus");
    await page.getByPlaceholder("Search by name, code, or designation...").fill(name);
    await expect(page.getByText(name)).not.toBeVisible();

    await switchBranch(page, "North Campus");
    await page.getByPlaceholder("Search by name, code, or designation...").fill(name);
    await expect(page.getByText(name)).toBeVisible();
  });

  // Money-adjacent branch-scoped table, chosen over a full fee invoice for
  // this isolation check since it needs no fee-structure setup chain --
  // fee invoice isolation specifically gets covered as part of the money-
  // flow lifecycle tests instead (see tests/fees/).
  test("an expense created in North Campus is invisible from Main Campus", async ({ page }) => {
    const auth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
    const api = await apiContextFor(auth.accessToken);
    const description = `E2EExpense${uniqueSuffix}`;

    const northBranchId = await getBranchIdByName(api, "North Campus");
    await createTestExpense(api, { branchId: northBranchId, description });
    await api.dispose();

    await page.goto("/expenses");
    await switchBranch(page, "Main Campus");
    await expect(page.getByText(description)).not.toBeVisible();

    await switchBranch(page, "North Campus");
    await expect(page.getByText(description)).toBeVisible();
  });
});
