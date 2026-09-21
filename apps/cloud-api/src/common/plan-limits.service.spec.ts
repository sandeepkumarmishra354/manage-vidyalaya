import { describe, expect, it, vi } from "vitest";

import type { DbService } from "../db/db.service.js";
import { PlanLimitsService } from "./plan-limits.service.js";

function makeDbMock() {
  return {
    query: vi.fn(),
    queryOne: vi.fn(),
  } as unknown as DbService & { query: ReturnType<typeof vi.fn>; queryOne: ReturnType<typeof vi.fn> };
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

describe("PlanLimitsService.getEligibleModules / isModuleEnabled", () => {
  it("returns every toggleable module for a Gold-tier tenant", async () => {
    const db = makeDbMock();
    db.query.mockResolvedValueOnce([
      { plan_tier: "gold", trial_ends_at: null, subscription_expires_at: null, is_suspended: false },
    ]);

    const service = new PlanLimitsService(db);
    const eligible = await service.getEligibleModules("tenant-1");

    expect(eligible.has("payroll")).toBe(true);
    expect(eligible.has("library")).toBe(true);
  });

  it("returns an empty set for a Silver-tier tenant", async () => {
    const db = makeDbMock();
    db.query.mockResolvedValueOnce([
      { plan_tier: "silver", trial_ends_at: null, subscription_expires_at: null, is_suspended: false },
    ]);

    const service = new PlanLimitsService(db);
    const eligible = await service.getEligibleModules("tenant-1");

    expect(eligible.size).toBe(0);
  });

  it("isModuleEnabled returns false immediately for a tier-ineligible module, without consulting module_settings", async () => {
    const db = makeDbMock();
    db.query.mockResolvedValueOnce([
      { plan_tier: "silver", trial_ends_at: null, subscription_expires_at: null, is_suspended: false },
    ]);

    const service = new PlanLimitsService(db);
    const enabled = await service.isModuleEnabled("tenant-1", "branch-1", "payroll");

    expect(enabled).toBe(false);
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it("isModuleEnabled does a tier-only check (no module_settings lookup) when branchId is null", async () => {
    const db = makeDbMock();
    db.query.mockResolvedValueOnce([
      { plan_tier: "gold", trial_ends_at: null, subscription_expires_at: null, is_suspended: false },
    ]);

    const service = new PlanLimitsService(db);
    const enabled = await service.isModuleEnabled("tenant-1", null, "payroll");

    expect(enabled).toBe(true);
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it("isModuleEnabled respects a branch's module_settings row once tier-eligible", async () => {
    const db = makeDbMock();
    db.query.mockResolvedValueOnce([
      { plan_tier: "gold", trial_ends_at: null, subscription_expires_at: null, is_suspended: false },
    ]);
    db.queryOne.mockResolvedValueOnce({ is_enabled: false });

    const service = new PlanLimitsService(db);
    const enabled = await service.isModuleEnabled("tenant-1", "branch-1", "payroll");

    expect(enabled).toBe(false);
  });

  it("isModuleEnabled defaults to enabled when no module_settings row exists for that branch", async () => {
    const db = makeDbMock();
    db.query.mockResolvedValueOnce([
      { plan_tier: "gold", trial_ends_at: null, subscription_expires_at: null, is_suspended: false },
    ]);
    db.queryOne.mockResolvedValueOnce(null);

    const service = new PlanLimitsService(db);
    const enabled = await service.isModuleEnabled("tenant-1", "branch-1", "payroll");

    expect(enabled).toBe(true);
  });
});
