/**
 * Ceiling arithmetic for governed model execution, kept free of runtime bindings
 * so the limit decisions can be unit tested directly.
 */

/**
 * Comfortably above the largest single deliberate batch, which is the twenty-case
 * regression set, so one batch cannot be refused outright while still bounding
 * how much a single account can spend in a minute.
 */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 30;
export const DEFAULT_DAILY_USD_CAP = 5;

export type BudgetCode = "MODEL_RATE_LIMITED" | "MODEL_SPEND_CAP_REACHED";

/** Refused before any provider is contacted, so it costs nothing to hit. */
export class ModelBudgetError extends Error {
  constructor(
    public code: BudgetCode,
    message: string,
    public retryAfterSeconds: number,
  ) {
    super(message);
  }
}

export type BudgetUsage = {
  callsLastMinute: number;
  spentUsdLastDay: number;
  perMinute: number;
  dailyUsd: number;
};

/** A zero or negative ceiling disables that limit. */
export function resolveLimits(perMinute: string | undefined, dailyUsd: string | undefined) {
  const numeric = (value: string | undefined, fallback: number) => {
    const raw = value?.trim() ?? "";
    // An empty variable means "not configured". Number("") is 0, which would
    // otherwise read as an explicit request to disable the ceiling.
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    perMinute: numeric(perMinute, DEFAULT_RATE_LIMIT_PER_MINUTE),
    dailyUsd: numeric(dailyUsd, DEFAULT_DAILY_USD_CAP),
  };
}

/**
 * Pure limit decision. `expectedCalls` is the size of the batch about to run, so
 * a three-provider ensemble or a twenty-case regression set is refused up front
 * instead of stopping halfway through and still being billed for the first half.
 */
export function budgetRefusal(usage: BudgetUsage, expectedCalls: number): ModelBudgetError | null {
  if (usage.perMinute > 0 && usage.callsLastMinute + expectedCalls > usage.perMinute) {
    return new ModelBudgetError(
      "MODEL_RATE_LIMITED",
      `This account has reached its limit of ${usage.perMinute} model calls per minute. Wait a moment and try again.`,
      60,
    );
  }

  if (usage.dailyUsd > 0 && usage.spentUsdLastDay >= usage.dailyUsd) {
    return new ModelBudgetError(
      "MODEL_SPEND_CAP_REACHED",
      `This account has reached its estimated daily model spend cap of $${usage.dailyUsd.toFixed(2)}. It resets on a rolling 24-hour window.`,
      3600,
    );
  }

  return null;
}

export function budgetErrorResponse(error: ModelBudgetError) {
  return Response.json(
    { code: error.code, error: error.message },
    { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } },
  );
}
