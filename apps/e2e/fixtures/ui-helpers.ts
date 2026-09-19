import type { Page } from "@playwright/test";

// Switches the active branch via the header's branch selector
// (apps/web/src/components/app-shell.tsx) -- only rendered as a Select
// (rather than plain text) when the tenant has more than one branch,
// which is always true for the personas this suite uses (Main Campus +
// North Campus both exist from seed.ts).
export async function switchBranch(page: Page, branchLabel: string): Promise<void> {
  await page.locator("header").getByRole("combobox").click();
  await page.getByRole("option", { name: branchLabel, exact: false }).click();
}
