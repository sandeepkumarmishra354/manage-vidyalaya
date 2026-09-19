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

async function expectOk(res: Awaited<ReturnType<APIRequestContext["get"]>>, label: string) {
  if (!res.ok()) {
    throw new Error(`${label} failed: ${res.status()} ${await res.text()}`);
  }
  return res;
}

export async function getBranchIdByName(api: APIRequestContext, name: string): Promise<string> {
  const res = await expectOk(await api.get("/branches"), "GET /branches");
  const branches = (await res.json()) as { id: string; name: string }[];
  const branch = branches.find((b) => b.name === name);
  if (!branch) throw new Error(`No branch named "${name}" found`);
  return branch.id;
}

export async function getCurrentAcademicSessionId(api: APIRequestContext): Promise<string> {
  const res = await expectOk(await api.get("/academic-sessions"), "GET /academic-sessions");
  const sessions = (await res.json()) as { id: string; is_current: boolean }[];
  const current = sessions.find((s) => s.is_current);
  if (!current) throw new Error("No current academic session found");
  return current.id;
}

// Creates a student the fast way (skips confirmation -- an "applied"
// admission already produces a real students row, which is all
// branch-visibility tests need). Returns the new student's id.
export async function createTestStudent(
  api: APIRequestContext,
  opts: { branchId: string; academicSessionId: string; firstName: string },
): Promise<string> {
  const res = await expectOk(
    await api.post("/admissions", {
      data: {
        branch_id: opts.branchId,
        academic_session_id: opts.academicSessionId,
        first_name: opts.firstName,
        guardian_name: `${opts.firstName} Guardian`,
        guardian_relation: "Father",
      },
    }),
    "POST /admissions",
  );
  const body = (await res.json()) as { id: string };
  return body.id;
}

export async function createTestStaff(
  api: APIRequestContext,
  opts: { branchId: string; firstName: string },
): Promise<string> {
  const res = await expectOk(
    await api.post("/staff", {
      data: {
        branch_id: opts.branchId,
        first_name: opts.firstName,
        designation: "E2E Test Staff",
        employment_type: "full_time",
        date_of_joining: new Date().toISOString().slice(0, 10),
      },
    }),
    "POST /staff",
  );
  const body = (await res.json()) as { id: string };
  return body.id;
}

export async function createTestExpense(
  api: APIRequestContext,
  opts: { branchId: string; description: string },
): Promise<string> {
  const res = await expectOk(
    await api.post("/expenses", {
      data: {
        branch_id: opts.branchId,
        description: opts.description,
        amount: 100_00,
        expense_date: new Date().toISOString().slice(0, 10),
      },
    }),
    "POST /expenses",
  );
  const body = (await res.json()) as { id: string };
  return body.id;
}
