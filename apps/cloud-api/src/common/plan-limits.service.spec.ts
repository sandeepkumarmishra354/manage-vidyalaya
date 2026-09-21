import { describe, expect, it, vi } from "vitest";

import type { DbService } from "../db/db.service.js";
import { PlanLimitsService } from "./plan-limits.service.js";

function makeDbMock() {
  return {
    query: vi.fn(),
  } as unknown as DbService & { query: ReturnType<typeof vi.fn> };
}

describe("PlanLimitsService.getPlanUsage", () => {
  it("merges the tenant's plan row with live usage counts against the tier's limits", async () => {
    const db = makeDbMock();
    db.query
      .mockResolvedValueOnce([
        { plan_tier: "silver", trial_ends_at: null, subscription_expires_at: null, is_suspended: false },
      ]) // getTenantPlanRow
      .mockResolvedValueOnce([{ count: "1" }]) // branches
      .mockResolvedValueOnce([{ count: "1" }]) // super_admins
      .mockResolvedValueOnce([{ count: "2" }]) // branch_admins
      .mockResolvedValueOnce([{ count: "300" }]) // students
      .mockResolvedValueOnce([{ count: "30" }]); // staff

    const service = new PlanLimitsService(db);
    const usage = await service.getPlanUsage("tenant-1");

    expect(usage).toEqual({
      plan_tier: "silver",
      trial_ends_at: null,
      subscription_expires_at: null,
      usage: {
        branches: { count: 1, limit: 1 },
        super_admins: { count: 1, limit: 1 },
        branch_admins: { count: 2, limit: 2 },
        students: { count: 300, limit: 300 },
        staff: { count: 30, limit: 30 },
      },
    });
  });

  it("treats a trial tenant's ceiling as Gold-tier limits", async () => {
    const db = makeDbMock();
    db.query
      .mockResolvedValueOnce([
        { plan_tier: "trial", trial_ends_at: new Date("2099-01-01"), subscription_expires_at: null, is_suspended: false },
      ])
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([{ count: "0" }]);

    const service = new PlanLimitsService(db);
    const usage = await service.getPlanUsage("tenant-1");

    expect(usage.usage.branches.limit).toBe(5);
    expect(usage.usage.students.limit).toBe(2000);
  });
});
