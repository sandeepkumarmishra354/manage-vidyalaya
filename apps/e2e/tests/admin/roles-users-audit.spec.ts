import { expect, test } from "@playwright/test";

import { apiContextFor, createTestStaff, getBranchIdByName, loginViaApi, relieveTestStaff } from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";

test.use({ storageState: authFilePath("superAdmin") });

test("roles, users, and audit log: create a custom role, assign it to a new login, see it in the audit log", async ({ page }) => {
  const suffix = Date.now();
  const setupAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(setupAuth.accessToken);
  const branchId = await getBranchIdByName(api, "North Campus");
  const staffId = await createTestStaff(api, { branchId, firstName: `E2ERoleStaff${suffix}` });

  const roleName = `e2e-role-${suffix}`;

  try {
    await page.goto("/admin/roles");
    await page.getByRole("button", { name: "New role" }).click();
    const roleDialog = page.getByRole("dialog", { name: "New role" });
    await roleDialog.locator("#role-name").fill(roleName);
    await roleDialog.getByRole("button", { name: "Create role" }).click();
    await expect(roleDialog).not.toBeVisible();

    await page.getByText(roleName, { exact: false }).click();
    await expect(page.getByText(`Permissions for "${roleName}"`)).toBeVisible();
    const libraryCheckbox = page.locator("label").filter({ hasText: "View library" }).locator('input[type="checkbox"]');
    await libraryCheckbox.check();
    await page.getByRole("button", { name: "Save permissions" }).click();
    await expect(page.getByRole("button", { name: "Saving..." })).not.toBeVisible();

    const loginEmail = `e2e.role.${suffix}@example.test`;
    await page.goto(`/staff/${staffId}`);
    await page.getByRole("button", { name: "Create login" }).click();
    const loginDialog = page.getByRole("dialog", { name: /Create a login/ });
    await loginDialog.locator("#login-email").fill(loginEmail);
    await loginDialog.locator("#login-password").fill("e2e-test-password-123");
    await loginDialog.getByRole("button", { name: "Create login" }).click();
    await expect(loginDialog).not.toBeVisible();

    await page.goto("/admin/users");
    await page.getByPlaceholder("Search by name or email...").fill(loginEmail);
    const userRow = page.getByRole("row", { name: new RegExp(loginEmail) });
    await expect(userRow).toBeVisible();

    await userRow.getByRole("combobox").filter({ hasText: "+ Add role" }).click();
    await page.getByRole("option", { name: roleName }).click();
    await expect(userRow.getByText(roleName)).toBeVisible();

    await page.goto("/admin/audit-log");
    await page.locator("#entity-table").fill("roles");
    await expect(page.getByText(new RegExp(`Created role.*${roleName}`))).toBeVisible();
  } finally {
    await relieveTestStaff(api, staffId);
    await api.dispose();
  }
});
