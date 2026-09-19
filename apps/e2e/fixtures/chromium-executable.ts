import { existsSync } from "node:fs";

// Some development sandboxes pre-install Chromium at this fixed path and
// disable Playwright's own browser download (PLAYWRIGHT_BROWSERS_PATH /
// PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD) -- pointing executablePath at it
// directly there avoids any mismatch between the installed @playwright/test
// version's expected browser revision and what's actually on disk. This
// path does not exist on a real GitHub Actions runner (or most developers'
// machines), so it's only used when actually present -- CI instead runs
// `playwright install --with-deps chromium` (see .github/workflows/e2e.yml)
// and lets Playwright resolve its own installed browser normally.
//
// Both playwright.config.ts (the test runner's own browser) and
// global-setup.ts (a separate chromium.launch() call for seeding auth
// state) need this -- keep it in one place so a future sandbox-path change
// can't update one call site and miss the other.
const SANDBOX_CHROMIUM_EXECUTABLE = "/opt/pw-browsers/chromium";

export function getSandboxChromiumExecutablePath(): string | undefined {
  return existsSync(SANDBOX_CHROMIUM_EXECUTABLE) ? SANDBOX_CHROMIUM_EXECUTABLE : undefined;
}
