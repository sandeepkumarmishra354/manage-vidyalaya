import { expect, test } from "@playwright/test";

import { setupAcademicFixture } from "../../fixtures/academic-fixture.js";
import { apiContextFor, createAndEnrollTestStudent, loginViaApi } from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";

test.use({ storageState: authFilePath("accountant") });

// Direct regression test for a previously-shipped bug: setStudentFeeAssignment
// (the "Overrides" -> Include flow) calls generateInvoiceForStudent, which for
// a session-unscoped ("All sessions") fee structure falls through to
// resolveCurrentSessionId. That method used to query academic_sessions by
// branchId, but sessions are tenant-scoped not branch-scoped, so it threw an
// unhandled error and the override request 500'd. Fixed by scoping the query
// by tenantId instead. This test creates a session-unscoped structure (the
// exact trigger condition) and exercises the Include-override flow through
// the real UI, asserting the invoice is created successfully with no error.
test("including a student in a session-unscoped fee structure via override does not 500", async ({ page }) => {
  const suffix = Date.now();
  const setupAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(setupAuth.accessToken);
  const fixture = await setupAcademicFixture(api, suffix);

  const studentName = `E2EOverrideStudent${suffix}`;
  const studentId = await createAndEnrollTestStudent(api, {
    branchId: fixture.branchId,
    academicSessionId: fixture.sessionId,
    classId: fixture.classId,
    sectionId: fixture.sectionId,
    firstName: studentName,
  });

  // A structure deliberately WITHOUT an academic_session_id -- "All
  // sessions" in the UI -- this is the exact condition that triggered
  // resolveCurrentSessionId's buggy branch-scoped session lookup. The
  // service forbids pairing a null session with a class_id (a class only
  // exists within one session), so this is necessarily branch-wide -- and
  // a session-unscoped structure always matches every future admission
  // confirm in this branch (FeesService.listMatchingStructures treats a
  // null academic_session_id as a wildcard), so it's "buried" into a
  // dedicated non-current session at the end of this test to keep it from
  // silently invoicing every later test run's students forever.
  const structureName = `E2EOverrideStructure${suffix}`;
  const structureRes = await api.post("fee-structures", {
    data: {
      branch_id: fixture.branchId,
      class_id: null,
      academic_session_id: null,
      name: structureName,
      amount: 300_000,
      frequency: "one_time",
      fee_type: "tuition",
    },
  });
  expect(structureRes.ok()).toBe(true);
  const { id: structureId } = (await structureRes.json()) as { id: string };

  // Everything from here on runs in a try/finally: a session-unscoped
  // structure is a landmine for every future test run in this branch (see
  // comment above), so it must be buried even if a UI assertion below
  // fails and throws -- an assertion failure must never skip cleanup.
  try {
    await page.goto("/fees");
    await page.getByRole("tab", { name: "Fee Structures" }).click();

    const structureRow = page.getByRole("row", { name: new RegExp(structureName) });
    await expect(structureRow).toBeVisible();
    await expect(structureRow.getByText("All sessions")).toBeVisible();

    await structureRow.getByRole("button", { name: "Overrides" }).click();
    const dialog = page.getByRole("dialog", { name: new RegExp(structureName) });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("combobox").filter({ hasText: "Select student" }).click();
    await page.getByRole("option", { name: new RegExp(studentName) }).click();
    await dialog.getByRole("combobox").filter({ hasText: "Exclude" }).click();
    await page.getByRole("option", { name: "Include", exact: true }).click();
    await dialog.getByRole("button", { name: "Add" }).click();

    // The bug manifested as an unhandled 500 -- the dialog's error state
    // renders a `p.text-destructive` with the error text instead of the
    // assignment succeeding. Scoped to that element specifically (not a
    // broad text regex over the whole dialog): the still-open student
    // <select>'s options list every previously-created test student, whose
    // Date.now()-based names can coincidentally contain "500" and falsely
    // match a loose /error|failed|500/i search.
    await expect(dialog.locator("p.text-destructive")).not.toBeVisible();
    await expect(dialog.getByText(studentName).first()).toBeVisible();
    await expect(dialog.getByText("include", { exact: true })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    const res = await api.get(`fee-invoices/student/${studentId}/summary`);
    const body = (await res.json()) as { total_due: number; invoices: { status: string }[] };
    expect(body.total_due).toBe(300_000);
    expect(body.invoices).toHaveLength(1);
    expect(body.invoices[0]?.status).toBe("pending");
  } finally {
    // Bury the now-unused session-unscoped structure in a dedicated,
    // deliberately non-current session (there's no delete endpoint for fee
    // structures -- financial records are kept, not removed) so it can
    // never match a future admission confirm's current-session lookup again.
    const graveyardSessionRes = await api.post("academic-sessions", {
      data: { name: `E2E Graveyard ${suffix}`, start_date: "2030-04-01", end_date: "2031-03-31", is_current: false },
    });
    if (graveyardSessionRes.ok()) {
      const { id: graveyardSessionId } = (await graveyardSessionRes.json()) as { id: string };
      await api.patch(`fee-structures/${structureId}`, {
        data: {
          name: structureName,
          amount: 300_000,
          frequency: "one_time",
          fee_type: "tuition",
          class_id: null,
          academic_session_id: graveyardSessionId,
        },
      });
    }
    await api.dispose();
  }
});
