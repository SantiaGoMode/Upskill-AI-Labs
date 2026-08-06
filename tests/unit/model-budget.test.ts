import { describe, expect, it } from "vitest";
import { budgetRefusal, resolveLimits, type BudgetUsage } from "../../app/lib/model-budget-limits";

const usage = (overrides: Partial<BudgetUsage> = {}): BudgetUsage => ({
  callsLastMinute: 0,
  spentUsdLastDay: 0,
  perMinute: 30,
  dailyUsd: 5,
  ...overrides,
});

describe("model budget ceilings", () => {
  it("allows a call that stays inside both ceilings", () => {
    expect(budgetRefusal(usage({ callsLastMinute: 4, spentUsdLastDay: 1.2 }), 1)).toBeNull();
  });

  it("admits a full twenty-case regression batch under the default limit", () => {
    // The default per-minute ceiling exists to bound abuse, not to make the
    // largest deliberate batch in the product impossible.
    expect(budgetRefusal(usage(), 20)).toBeNull();
  });

  it("refuses a batch that would cross the per-minute ceiling", () => {
    const refusal = budgetRefusal(usage({ callsLastMinute: 15 }), 20);
    expect(refusal?.code).toBe("MODEL_RATE_LIMITED");
    expect(refusal?.retryAfterSeconds).toBe(60);
  });

  it("refuses the call that would exceed the per-minute ceiling by one", () => {
    expect(budgetRefusal(usage({ callsLastMinute: 29 }), 1)).toBeNull();
    expect(budgetRefusal(usage({ callsLastMinute: 30 }), 1)?.code).toBe("MODEL_RATE_LIMITED");
  });

  it("refuses once the rolling daily spend cap is reached", () => {
    expect(budgetRefusal(usage({ spentUsdLastDay: 4.99 }), 1)).toBeNull();
    const refusal = budgetRefusal(usage({ spentUsdLastDay: 5 }), 1);
    expect(refusal?.code).toBe("MODEL_SPEND_CAP_REACHED");
    expect(refusal?.message).toContain("$5.00");
  });

  it("treats a zero or negative ceiling as disabled", () => {
    expect(budgetRefusal(usage({ perMinute: 0, callsLastMinute: 9_000 }), 50)).toBeNull();
    expect(budgetRefusal(usage({ dailyUsd: 0, spentUsdLastDay: 9_000 }), 1)).toBeNull();
    expect(budgetRefusal(usage({ perMinute: -1, dailyUsd: -1, callsLastMinute: 99, spentUsdLastDay: 99 }), 1)).toBeNull();
  });

  it("reports the rate limit before the spend cap when both are exhausted", () => {
    expect(budgetRefusal(usage({ callsLastMinute: 30, spentUsdLastDay: 50 }), 1)?.code).toBe("MODEL_RATE_LIMITED");
  });
});

describe("configured ceilings", () => {
  it("falls back to defaults for unset, blank, and unparseable values", () => {
    expect(resolveLimits(undefined, undefined)).toEqual({ perMinute: 30, dailyUsd: 5 });
    expect(resolveLimits("  ", "not-a-number")).toEqual({ perMinute: 30, dailyUsd: 5 });
  });

  it("reads configured ceilings, including a disabling zero", () => {
    expect(resolveLimits("60", "12.5")).toEqual({ perMinute: 60, dailyUsd: 12.5 });
    expect(resolveLimits("0", "0")).toEqual({ perMinute: 0, dailyUsd: 0 });
  });
});
