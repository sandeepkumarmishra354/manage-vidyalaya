import { defineConfig, devices } from "@playwright/test";

import { API_BASE_URL } from "./fixtures/api-url.js";
import { getSandboxChromiumExecutablePath } from "./fixtures/chromium-executable.js";

const executablePath = getSandboxChromiumExecutablePath();

const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./fixtures/global-setup.ts",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Only starts the dev servers when they're not already running (the
  // reuseExistingServer option below lets a developer who already has
  // `pnpm dev` running locally skip the extra startup cost); CI always
  // starts fresh.
  webServer: [
    {
      command: "pnpm --filter cloud-api start:dev",
      cwd: "../..",
      url: `${API_BASE_URL}health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
      // The suite logs the same fixed persona emails in from one IP far
      // more often per minute than any real user would (global-setup.ts
      // plus every spec that calls loginViaApi for API-level test-data
      // setup) -- @nestjs/throttler's login rate limit would otherwise
      // reject the suite's own setup calls. See cloud-api's
      // .env.example for why this must never be set in production.
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
        THROTTLE_DISABLED: "1",
      },
    },
    {
      command: "pnpm --filter web dev -- --port 5173",
      cwd: "../..",
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
