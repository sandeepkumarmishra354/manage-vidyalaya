import { expect, test } from "@playwright/test";

import { setupAcademicFixture } from "../../fixtures/academic-fixture.js";
import { apiContextFor, loginViaApi } from "../../fixtures/api-client.js";
import { authFilePath, PERSONAS } from "../../fixtures/personas.js";

// branch_admin holds timetable.manage.
test.use({ storageState: authFilePath("branchAdmin") });

test.describe("timetable", () => {
  test("adding two period slots back-to-back does not collide (regression: sort_order collision)", async ({ page }) => {
    const suffix = Date.now();

    await page.goto("/timetable");
    await page.getByRole("tab", { name: "Manage Periods" }).click();

    for (const name of [`E2EPeriod${suffix}A`, `E2EPeriod${suffix}B`]) {
      await page.getByLabel("Name").fill(name);
      await page.getByLabel("Start time").fill("09:00");
      await page.getByLabel("End time").fill("09:40");
      await page.getByRole("button", { name: "Add" }).click();
      await expect(page.getByText(name)).toBeVisible();
    }
  });

  test("deleting a period slot then adding a new one does not collide with the deleted slot's old sort_order", async ({
    page,
  }) => {
    const suffix = Date.now();
    const firstName = `E2EPeriodDel${suffix}A`;
    const secondName = `E2EPeriodDel${suffix}B`;

    await page.goto("/timetable");
    await page.getByRole("tab", { name: "Manage Periods" }).click();

    await page.getByLabel("Name").fill(firstName);
    await page.getByLabel("Start time").fill("10:00");
    await page.getByLabel("End time").fill("10:40");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText(firstName)).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(firstName) });
    await row.getByRole("button").last().click(); // delete (icon-only button)
    await expect(page.getByText(firstName)).not.toBeVisible();

    await page.getByLabel("Name").fill(secondName);
    await page.getByLabel("Start time").fill("10:00");
    await page.getByLabel("End time").fill("10:40");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText(secondName)).toBeVisible();
  });

  test("a teacher double-booked across two sections at the same day/period is rejected", async ({ page }) => {
    const suffix = Date.now();
    const auth = await loginViaApi(PERSONAS.superAdmin.email, PERSONAS.superAdmin.password);
    const api = await apiContextFor(auth.accessToken);

    const fixture = await setupAcademicFixture(api, suffix);

    // A second section in the same class, sharing the fixture's subject
    // teacher -- the double-booking check is cross-section, so this needs
    // two real sections, not just two period slots.
    const secondSectionRes = await api.post("sections", { data: { class_id: fixture.classId, name: "B" } });
    expect(secondSectionRes.ok()).toBe(true);
    const { id: secondSectionId } = (await secondSectionRes.json()) as { id: string };

    const slotRes = await api.post("timetable/period-slots", {
      data: {
        branch_id: fixture.branchId,
        academic_session_id: fixture.sessionId,
        name: `E2EGridSlot${suffix}`,
        start_time: "11:00",
        end_time: "11:40",
        period_type: "teaching",
      },
    });
    expect(slotRes.ok()).toBe(true);
    const { id: slotId } = (await slotRes.json()) as { id: string };

    const entry = {
      day_of_week: 1,
      period_slot_id: slotId,
      subject_id: fixture.subjectId,
      staff_id: fixture.subjectTeacherStaffId,
    };

    const firstSaveRes = await api.put(`timetable/sections/${fixture.sectionId}`, {
      data: { branch_id: fixture.branchId, class_id: fixture.classId, academic_session_id: fixture.sessionId, entries: [entry] },
    });
    expect(firstSaveRes.ok()).toBe(true);

    const conflictingSaveRes = await api.put(`timetable/sections/${secondSectionId}`, {
      data: { branch_id: fixture.branchId, class_id: fixture.classId, academic_session_id: fixture.sessionId, entries: [entry] },
    });
    expect(conflictingSaveRes.status()).toBe(400);
    const body = (await conflictingSaveRes.json()) as { message: string };
    expect(body.message).toMatch(/already scheduled/);
    await api.dispose();

    // Lighter UI check: the successfully-saved section's grid actually
    // renders the assignment, proving the save flowed through to the read
    // path too, not just the write.
    await page.goto("/timetable");
    await page.getByRole("tab", { name: "Grid Editor" }).click();
    await page.getByRole("combobox").filter({ hasText: "Select class" }).click();
    await page.getByRole("option", { name: new RegExp(`E2E Class ${suffix}`) }).click();
    await page.getByRole("combobox").filter({ hasText: "Select section" }).click();
    await page.getByRole("option", { name: "A", exact: true }).click();

    await expect(page.getByText(`E2E Subject ${suffix}`).first()).toBeVisible();
  });
});
