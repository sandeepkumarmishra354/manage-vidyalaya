import { describe, expect, it } from "vitest";

import { componentAmount, daysInMonth } from "./payroll.service.js";

describe("componentAmount", () => {
  it("returns the fixed amount as-is for a fixed component", () => {
    expect(componentAmount(3_000_000, { calculationType: "fixed", amount: 500_000, percent: null })).toBe(500_000);
  });

  it("computes percent_of_basic rounded to the nearest paisa", () => {
    // 12% of 3,000,000 = 360,000 exactly
    expect(componentAmount(3_000_000, { calculationType: "percent_of_basic", amount: null, percent: 12 })).toBe(
      360_000,
    );
  });

  it("rounds a non-integer percent_of_basic result", () => {
    // 33,333.33... rounds to 33,333
    expect(componentAmount(1_000_000, { calculationType: "percent_of_basic", amount: null, percent: 3.3333 })).toBe(
      33_333,
    );
  });

  it("treats a missing percent as zero", () => {
    expect(componentAmount(1_000_000, { calculationType: "percent_of_basic", amount: null, percent: null })).toBe(0);
  });

  it("treats a missing fixed amount as zero", () => {
    expect(componentAmount(1_000_000, { calculationType: "fixed", amount: null, percent: null })).toBe(0);
  });
});

describe("daysInMonth", () => {
  it("matches the exact scenario from the Rust payroll_integration.rs test: April 2026 has 30 days", () => {
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it("handles a 31-day month", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
  });

  it("handles February in a non-leap year", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it("handles February in a leap year", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  it("handles December rolling over into the next year", () => {
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});
