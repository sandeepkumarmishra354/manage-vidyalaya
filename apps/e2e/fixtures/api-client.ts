import { request as apiRequest, type APIRequestContext } from "@playwright/test";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:3001";

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  userId: string;
  tenantId: string;
}

// Thin wrapper for setting up prerequisite data directly against the API
// (fast, no UI needed) when a test's actual subject is something else --
// e.g. creating a student via API before testing that a *different*
// persona can/can't see it, rather than clicking through the admission
// wizard just to get there.
export async function loginViaApi(email: string, password: string): Promise<LoginResult> {
  const context = await apiRequest.newContext({ baseURL: API_URL });
  try {
    const res = await context.post("/auth/login", { data: { email, password } });
    if (!res.ok()) {
      throw new Error(`API login failed for ${email}: ${res.status()} ${await res.text()}`);
    }
    const body = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      user: { id: string; tenant_id: string };
    };
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      userId: body.user.id,
      tenantId: body.user.tenant_id,
    };
  } finally {
    await context.dispose();
  }
}

// An authenticated request context bound to one persona's access token --
// use for API-level test-data setup/teardown/assertions alongside a
// browser page that's testing the actual UI flow.
export async function apiContextFor(accessToken: string): Promise<APIRequestContext> {
  return apiRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
  });
}
