import fs from "node:fs";

import { chromium, request as apiRequest } from "@playwright/test";

import { API_BASE_URL } from "./api-url.js";
import { getSandboxChromiumExecutablePath } from "./chromium-executable.js";
import { AUTH_DIR, PERSONAS, authFilePath, type PersonaName } from "./personas.js";

// localStorage keys apps/web/src/lib/http.ts stores tokens under -- kept in
// sync manually since this package doesn't import from apps/web.
const ACCESS_TOKEN_KEY = "vidyalaya.access_token";
const REFRESH_TOKEN_KEY = "vidyalaya.refresh_token";

const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:5173";

// Logs in every persona once via a direct API call (faster and less flaky
// than driving the login form per persona) and saves a Playwright
// storageState per persona, so individual test files can start already
// authenticated by declaring `storageState: authFilePath("teacher")` etc.
export default async function globalSetup() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const apiContext = await apiRequest.newContext({ baseURL: API_BASE_URL });
  const executablePath = getSandboxChromiumExecutablePath();
  const browser = await chromium.launch(executablePath ? { executablePath } : {});

  try {
    for (const [name, creds] of Object.entries(PERSONAS) as [PersonaName, (typeof PERSONAS)[PersonaName]][]) {
      const loginRes = await apiContext.post("/auth/login", {
        data: { email: creds.email, password: creds.password },
      });
      if (!loginRes.ok()) {
        throw new Error(
          `E2E persona login failed for "${name}" (${creds.email}): ${loginRes.status()} ${await loginRes.text()}`,
        );
      }
      const body = (await loginRes.json()) as { access_token: string; refresh_token: string };

      const page = await browser.newPage();
      await page.goto(WEB_URL);
      await page.evaluate(
        ({ accessKey, refreshKey, access, refresh }) => {
          localStorage.setItem(accessKey, access);
          localStorage.setItem(refreshKey, refresh);
        },
        { accessKey: ACCESS_TOKEN_KEY, refreshKey: REFRESH_TOKEN_KEY, access: body.access_token, refresh: body.refresh_token },
      );
      await page.goto(WEB_URL);
      await page.waitForLoadState("networkidle");

      if (page.url().includes("/login")) {
        throw new Error(
          `E2E persona "${name}" (${creds.email}) bootstrapped back to /login -- token accepted by the API but the frontend rejected the session.`,
        );
      }

      await page.context().storageState({ path: authFilePath(name) });
      await page.close();
    }
  } finally {
    await apiContext.dispose();
    await browser.close();
  }
}
