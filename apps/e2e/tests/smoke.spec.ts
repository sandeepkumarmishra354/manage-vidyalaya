import { expect, test } from "@playwright/test";

import { authFilePath } from "../fixtures/personas.js";

// Proves the whole pipeline works before anything else is built on top of
// it: both dev servers are up, Postgres is reachable, the super_admin
// persona's saved storageState (from global-setup) is valid, and the app
// actually renders past login.
test.use({ storageState: authFilePath("superAdmin") });

test("super_admin lands on the dashboard and can log out", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Demo Vidyalaya School")).toBeVisible();

  await page.getByRole("button", { name: "Demo Admin" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();

  await expect(page).toHaveURL(/\/login/);
});
