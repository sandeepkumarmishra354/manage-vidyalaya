import { expect, test } from "@playwright/test";

import {
  apiContextFor,
  createTestStaff,
  getBranchIdByName,
  loginViaApi,
  markStaffAttendance,
  relieveTestStaff,
  setTestSalaryStructure,
} from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";
import { switchBranch } from "../../fixtures/ui-helpers.js";

test.use({ storageState: authFilePath("branchAdmin") });

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// A long-past, run-unique period so this test's payroll_runs row is
// unlikely to collide with another run's (branch_id, period_month,
// period_year) -- mirrors the self-isolating-per-run pattern used for fee
// structures. Must stay in the past (staff-attendance marking rejects
// future dates) but well before any real academic session's date range,
// so no school_calendars row covers it and every day defaults to
// "working" (SchoolCalendarService.getDayTypesInRange's no-calendar-match
// branch) -- keeps the LOP math simple and deterministic instead of
// depending on real holiday data. A period collision alone is harmless
// (asserted against by staff_id below, not array length) -- it would only
// ever fail this test via a genuine live-run uniqueness clash, which the
// test staff's relieve-on-exit cleanup keeps from compounding run to run.
function uniquePeriod(suffix: number): { month: number; year: number } {
  return { month: (suffix % 12) + 1, year: 1930 + (suffix % 90) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

test("payroll run: generate with LOP, finalize, reopen, delete, regenerate, mark paid", async ({ page }) => {
  const suffix = Date.now();
  const setupAuth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
  const api = await apiContextFor(setupAuth.accessToken);
  const branchId = await getBranchIdByName(api, "North Campus");

  const staffName = `E2EPayrollStaff${suffix}`;
  const staffId = await createTestStaff(api, { branchId, firstName: staffName });
  await setTestSalaryStructure(api, { branchId, staffId, basicAmountRupees: 30_000 });

  const { month, year } = uniquePeriod(suffix);
  const monthStr = String(month).padStart(2, "0");
  // Two absent (LOP) days inside the period -- deterministic since every
  // day in this far-future period is "working" (no calendar row matches).
  await markStaffAttendance(api, { branchId, staffId, date: `${year}-${monthStr}-05`, status: "absent" });
  await markStaffAttendance(api, { branchId, staffId, date: `${year}-${monthStr}-06`, status: "absent" });

  const workingDays = daysInMonth(year, month);
  // lopAmount = round(grossBeforeLop / workingDaysInPeriod * daysLop)
  const expectedLop = Math.round((3_000_000 / workingDays) * 2);
  const expectedNetPay = 3_000_000 - expectedLop;

  // Everything from here on runs in a try/finally: a staff member created
  // by this test would otherwise stay "active" forever (its salary
  // structure is eternally effective), so it'd get swept into every
  // future payroll run generated for North Campus by any later test run --
  // the same kind of unbounded cross-run accumulation the fee-structure
  // tests guard against. Relieving it on exit, even on failure, keeps
  // this test self-isolating.
  try {
    await page.goto("/payroll");
    await switchBranch(page, "North Campus");

    await page.getByRole("button", { name: "Generate payroll run" }).click();
    const generateDialog = page.getByRole("dialog", { name: "Generate a payroll run" });
    await expect(generateDialog).toBeVisible();
    await generateDialog.getByRole("combobox").click();
    await page.getByRole("option", { name: MONTH_NAMES[month - 1], exact: true }).click();
    await generateDialog.locator("#year").fill(String(year));
    await generateDialog.getByRole("button", { name: "Generate" }).click();
    await expect(generateDialog).not.toBeVisible();

    // Generation navigates straight to the run detail page.
    await expect(page).toHaveURL(/\/payroll\/[^/]+$/);
    const staffRow = page.getByRole("row", { name: new RegExp(staffName) });
    await expect(staffRow).toBeVisible();
    await expect(staffRow.getByText("draft")).toBeVisible();

    const runId = page.url().split("/payroll/")[1];

    async function runDetail() {
      const res = await api.get(`/payroll-runs/${runId}`);
      return (await res.json()) as {
        run: { status: string };
        payslips: { staff_id: string; status: string; days_lop: number; gross_earnings: number; net_pay: number }[];
      };
    }

    // Looked up by staff_id, not assumed to be the only payslip in the
    // run -- a period collision with another run is harmless as long as
    // this run's own payslip carries the right numbers.
    function ownPayslip(detail: Awaited<ReturnType<typeof runDetail>>) {
      const payslip = detail.payslips.find((p) => p.staff_id === staffId);
      expect(payslip).toBeTruthy();
      return payslip!;
    }

    let detail = await runDetail();
    let payslip = ownPayslip(detail);
    expect(payslip.days_lop).toBe(2);
    expect(payslip.gross_earnings).toBe(expectedNetPay);
    expect(payslip.net_pay).toBe(expectedNetPay);

    // Finalize.
    await page.getByRole("button", { name: "Finalize run" }).click();
    await expect(page.getByRole("button", { name: "Reopen run" })).toBeVisible();
    detail = await runDetail();
    expect(detail.run.status).toBe("finalized");
    expect(ownPayslip(detail).status).toBe("finalized");

    // Reopen -- back to draft, payslip back to draft too.
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reopen run" }).click();
    await expect(page.getByRole("button", { name: "Finalize run" })).toBeVisible();
    detail = await runDetail();
    expect(detail.run.status).toBe("draft");
    expect(ownPayslip(detail).status).toBe("draft");

    // Delete the draft run from the list page.
    await page.goto("/payroll");
    await switchBranch(page, "North Campus");
    const runRow = page.getByRole("row", { name: new RegExp(`${MONTH_NAMES[month - 1]} ${year}`) }).first();
    await expect(runRow).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await runRow.getByRole("button").click();
    await expect(runRow).not.toBeVisible();

    const deletedRes = await api.get(`/payroll-runs/${runId}`);
    expect((await deletedRes.json()).run.deleted_at).not.toBeNull();

    // Direct regression check for the fixed bug: payroll_runs' unique
    // index on (branch_id, period_month, period_year) used to have no
    // `WHERE deleted_at IS NULL` filter, so deleting a draft run
    // permanently occupied its period slot and regenerating for the same
    // period threw an unhandled 500. Regenerating here for the exact same
    // period must now succeed through the real UI.
    await page.getByRole("button", { name: "Generate payroll run" }).click();
    const regenDialog = page.getByRole("dialog", { name: "Generate a payroll run" });
    await regenDialog.getByRole("combobox").click();
    await page.getByRole("option", { name: MONTH_NAMES[month - 1], exact: true }).click();
    await regenDialog.locator("#year").fill(String(year));
    await regenDialog.getByRole("button", { name: "Generate" }).click();
    // If the bug regressed, the dialog stays open with a destructive error
    // message instead of closing -- this times out clearly rather than
    // silently passing.
    await expect(regenDialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/payroll\/[^/]+$/);

    const newRunId = page.url().split("/payroll/")[1];
    expect(newRunId).not.toBe(runId);

    // Finalize the new run and mark this staff's payslip paid.
    await page.getByRole("button", { name: "Finalize run" }).click();
    const newStaffRow = page.getByRole("row", { name: new RegExp(staffName) });
    await expect(newStaffRow.getByRole("button", { name: "Mark paid" })).toBeVisible();
    await newStaffRow.getByRole("button", { name: "Mark paid" }).click();
    await expect(newStaffRow.getByRole("button", { name: "Mark paid" })).not.toBeVisible();

    const finalRes = await api.get(`/payroll-runs/${newRunId}`);
    const finalDetail = (await finalRes.json()) as {
      run: { status: string };
      payslips: { staff_id: string; status: string }[];
    };
    expect(finalDetail.run.status).toBe("finalized");
    expect(finalDetail.payslips.find((p) => p.staff_id === staffId)?.status).toBe("paid");
  } finally {
    await relieveTestStaff(api, staffId);
    await api.dispose();
  }
});
