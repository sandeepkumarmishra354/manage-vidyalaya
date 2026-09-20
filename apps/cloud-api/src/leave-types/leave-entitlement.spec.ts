import { describe, expect, it } from "vitest";

import { accruedEntitlementDays } from "./leave-entitlement.js";

describe("accruedEntitlementDays", () => {
  it("accrues one month's worth per completed month since 1 Jan, inclusive of the current month", () => {
    // Joined well before this year -- so accrual starts from 1 Jan.
    const dateOfJoining = new Date("2020-01-01T00:00:00.000Z");
    expect(accruedEntitlementDays(1, dateOfJoining, new Date("2026-01-15T00:00:00.000Z"))).toBe(1);
    expect(accruedEntitlementDays(1, dateOfJoining, new Date("2026-03-01T00:00:00.000Z"))).toBe(3);
    expect(accruedEntitlementDays(1, dateOfJoining, new Date("2026-12-31T00:00:00.000Z"))).toBe(12);
  });

  it("pro-rates from the joining month for a staff member who joined mid-year", () => {
    const dateOfJoining = new Date("2026-06-15T00:00:00.000Z");
    // June counts as a whole accrued month even though joining was mid-month.
    expect(accruedEntitlementDays(1, dateOfJoining, new Date("2026-06-20T00:00:00.000Z"))).toBe(1);
    expect(accruedEntitlementDays(1, dateOfJoining, new Date("2026-09-01T00:00:00.000Z"))).toBe(4);
  });

  it("accrues nothing before the joining date", () => {
    const dateOfJoining = new Date("2026-06-15T00:00:00.000Z");
    expect(accruedEntitlementDays(1, dateOfJoining, new Date("2026-05-01T00:00:00.000Z"))).toBe(0);
  });

  it("resets accrual at each calendar year (never carries over from a prior year)", () => {
    const dateOfJoining = new Date("2020-01-01T00:00:00.000Z");
    expect(accruedEntitlementDays(1, dateOfJoining, new Date("2027-02-01T00:00:00.000Z"))).toBe(2);
  });

  it("scales with a non-integer monthly rate", () => {
    const dateOfJoining = new Date("2020-01-01T00:00:00.000Z");
    expect(accruedEntitlementDays(0.5, dateOfJoining, new Date("2026-04-01T00:00:00.000Z"))).toBe(2);
  });
});
