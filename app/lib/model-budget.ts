import { env } from "cloudflare:workers";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { modelUsageEvents } from "../../db/schema";
import { budgetRefusal, resolveLimits, type BudgetUsage } from "./model-budget-limits";
import type { ModelCost, ModelProvider, ModelUsage } from "./model-run-types";

export {
  budgetErrorResponse,
  budgetRefusal,
  ModelBudgetError,
  type BudgetCode,
  type BudgetUsage,
} from "./model-budget-limits";

/** Where a provider call originated. Recorded so spend can be attributed. */
export type ModelPurpose = "workbench" | "judge" | "regression" | "live-room";

export const budgetLimits = () => resolveLimits(env.MODEL_RATE_LIMIT_PER_MINUTE, env.MODEL_DAILY_USD_CAP);

const since = (milliseconds: number) => new Date(Date.now() - milliseconds).toISOString();

export async function currentUsage(ownerEmail: string): Promise<BudgetUsage> {
  const limits = budgetLimits();
  const [minute] = await getDb()
    .select({ calls: sql<number>`count(*)` })
    .from(modelUsageEvents)
    .where(and(eq(modelUsageEvents.ownerEmail, ownerEmail), gte(modelUsageEvents.createdAt, since(60_000))));
  const [day] = await getDb()
    .select({ spent: sql<number>`coalesce(sum(${modelUsageEvents.estimatedUsd}), 0)` })
    .from(modelUsageEvents)
    .where(and(eq(modelUsageEvents.ownerEmail, ownerEmail), gte(modelUsageEvents.createdAt, since(86_400_000))));

  return {
    callsLastMinute: Number(minute?.calls ?? 0),
    spentUsdLastDay: Number(day?.spent ?? 0),
    perMinute: limits.perMinute,
    dailyUsd: limits.dailyUsd,
  };
}

/** Throws when the caller has exhausted either ceiling. */
export async function assertModelBudget(ownerEmail: string, expectedCalls = 1) {
  const refusal = budgetRefusal(await currentUsage(ownerEmail), expectedCalls);
  if (refusal) throw refusal;
}

/** Records a completed call. Ollama runs locally and contributes zero spend. */
export async function recordModelUsage(input: {
  ownerEmail: string;
  purpose: ModelPurpose;
  provider: ModelProvider;
  model: string;
  usage: ModelUsage;
  cost: ModelCost;
}) {
  await getDb().insert(modelUsageEvents).values({
    id: crypto.randomUUID(),
    ownerEmail: input.ownerEmail,
    purpose: input.purpose,
    provider: input.provider,
    model: input.model,
    estimatedUsd: input.cost.estimatedUsd,
    totalTokens: input.usage.totalTokens,
  });
}
