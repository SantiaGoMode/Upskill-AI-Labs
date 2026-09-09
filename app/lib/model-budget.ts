import { AsyncLocalStorage } from "node:async_hooks";
import { recordOrganization } from "./organization-scope";
import { createHash } from "node:crypto";
import { env } from "./server-env";
import { and, eq, gte } from "../../db/firestore-orm";
import { assertErasureWriteAllowed } from "../../db/erasure-guard";
import { getDb } from "../../db";
import { modelBudgetLedgers, modelUsageEvents } from "../../db/schema";
import { budgetRefusal, resolveLimits, ModelBudgetError, type BudgetUsage } from "./model-budget-limits";
import { estimateModelCost } from "./model-pricing";
import type { ModelCost, ModelProvider, ModelUsage } from "./model-run-types";

export { budgetErrorResponse, budgetRefusal, ModelBudgetError, type BudgetCode, type BudgetUsage } from "./model-budget-limits";
export type ModelPurpose = "workbench" | "judge" | "regression" | "live-room";
export const budgetLimits = () => resolveLimits(env.MODEL_RATE_LIMIT_PER_MINUTE, env.MODEL_DAILY_USD_CAP);
export const MAX_MODEL_INPUT_BYTES = 131_072;
export const MAX_MODEL_OUTPUT_TOKENS = 800;
const DAY = 86_400_000;
const LEASE = 240_000; // Covers three local 60-second attempts plus bounded backoff.
const ledgerId = (email: string) => createHash("sha256").update(email).digest("hex");
type Slot = { provider: ModelProvider; model: string; usd: number; startedAt?: number };
type Reservation = { expiresAt: number; slots: Array<Slot | null> };
type State = { calls: number[]; spend: Record<string, number>; unknown: Record<string, number>; holds: Record<string, Reservation> };
type Scope = { owner?: string; id?: string; purpose?: ModelPurpose };
const scopes = new AsyncLocalStorage<Scope>();
const empty = (): State => ({ calls: [], spend: {}, unknown: {}, holds: {} });
const minuteEnd = (at: number) => String((Math.floor(at / 60_000) + 1) * 60_000);
const charge = (state: State, at: number, usd: number, unknown = false) => {
  const key = minuteEnd(at);
  state.spend[key] = (state.spend[key] ?? 0) + usd;
  if (unknown) state.unknown[key] = (state.unknown[key] ?? 0) + 1;
};
function prune(state: State, now: number) {
  state.calls = state.calls.filter((at) => at > now - 60_000);
  for (const buckets of [state.spend, state.unknown]) for (const key of Object.keys(buckets)) if (Number(key) <= now - DAY) delete buckets[key];
  for (const [id, hold] of Object.entries(state.holds)) {
    if (hold.expiresAt > now) continue;
    for (const slot of hold.slots) if (slot?.startedAt !== undefined && hold.expiresAt > now - DAY) charge(state, hold.expiresAt, slot.usd);
    delete state.holds[id];
  }
}
function usage(state: State): BudgetUsage {
  const pending = Object.values(state.holds).flatMap((hold) => hold.slots).filter((slot): slot is Slot => slot !== null);
  const limits = budgetLimits();
  return { callsLastMinute: state.calls.length + pending.filter((slot) => slot.startedAt === undefined).length,
    spentUsdLastDay: Object.values(state.spend).reduce((a, b) => a + b, 0) + pending.reduce((sum, slot) => sum + slot.usd, 0),
    perMinute: limits.perMinute, dailyUsd: limits.dailyUsd };
}
async function historical(email: string): Promise<State> {
  const state = empty();
  const rows = await getDb().select().from(modelUsageEvents).where(and(eq(modelUsageEvents.ownerEmail, email), gte(modelUsageEvents.createdAt, new Date(Date.now() - DAY).toISOString())));
  for (const row of rows) { const at = Date.parse(row.createdAt); state.calls.push(at); charge(state, at, row.estimatedUsd ?? 0, row.estimatedUsd === null); }
  return state;
}
async function mutate<T>(email: string, work: (state: State, now: number) => T, event?: { id: string; provider: ModelProvider; model: string; purpose: ModelPurpose; usage: ModelUsage; cost: ModelCost }) {
  const db = getDb();
  const id = ledgerId(email);
  const [existing] = await db.select().from(modelBudgetLedgers).where(eq(modelBudgetLedgers.id, id));
  const seed = existing ? empty() : await historical(email);
  const organizationId = event ? await recordOrganization(email) : null;
  return db.transaction(async (tx) => {
    const row = await tx.get(modelBudgetLedgers.tableName, id);
    await assertErasureWriteAllowed(tx, modelBudgetLedgers.tableName, { ownerEmail: email });
    const state = row ? JSON.parse(String(row.stateJson)) as State : structuredClone(seed);
    const now = Date.now();
    prune(state, now);
    const result = work(state, now);
    tx.put(modelBudgetLedgers.tableName, id, { id, ownerEmail: email, stateJson: JSON.stringify(state) });
    if (event) tx.put(modelUsageEvents.tableName, event.id, { id: event.id, organizationId, ownerEmail: email, purpose: event.purpose, provider: event.provider, model: event.model, estimatedUsd: event.cost.estimatedUsd, totalTokens: event.usage.totalTokens, createdAt: new Date(now).toISOString() });
    return result;
  });
}
export async function currentUsage(email: string): Promise<BudgetUsage> {
  const [row] = await getDb().select().from(modelBudgetLedgers).where(eq(modelBudgetLedgers.id, ledgerId(email)));
  const state = row ? JSON.parse(row.stateJson) as State : await historical(email);
  prune(state, Date.now());
  return usage(state);
}

/** Reserve the full batch. Input-byte and output-token ceilings are enforced at dispatch. */
export async function assertModelBudget(owner: string, plans: Array<{ provider: ModelProvider; model: string }>, purpose: ModelPurpose) {
  const scope = scopes.getStore();
  if (!scope || scope.id) throw new Error("Model reservation requires a fresh budget scope.");
  const id = crypto.randomUUID();
  const slots = plans.map(({ provider, model }) => {
    const cost = estimateModelCost(provider, model, { inputTokens: MAX_MODEL_INPUT_BYTES + 2048, outputTokens: MAX_MODEL_OUTPUT_TOKENS, cachedInputTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 0 });
    if (cost.estimatedUsd === null && budgetLimits().dailyUsd > 0) throw new ModelBudgetError("MODEL_PRICING_UNAVAILABLE", "This model has no configured price. Choose a priced model to use the spend cap.", 60);
    return { provider, model, usd: cost.estimatedUsd ?? 0 };
  });
  await mutate(owner, (state, now) => {
    const refusal = budgetRefusal(usage(state), slots.length);
    if (refusal) throw refusal;
    if (budgetLimits().dailyUsd > 0 && (Object.keys(state.unknown).length || usage(state).spentUsdLastDay + slots.reduce((sum, slot) => sum + slot.usd, 0) > budgetLimits().dailyUsd)) {
      throw new ModelBudgetError("MODEL_SPEND_CAP_REACHED", "The batch's reserved cost exceeds the remaining daily budget, or recent usage is unmetered.", 3600);
    }
    if (!slots.length || slots.length > 2000) throw new Error("Invalid model reservation size.");
    if (usage(state).callsLastMinute + slots.length > 2000 || Object.values(state.holds).reduce((sum, hold) => sum + hold.slots.length, slots.length) > 2000 || Object.keys(state.holds).length >= 100) throw new ModelBudgetError("MODEL_RATE_LIMITED", "Too many active model requests. Retry shortly.", 60);
    state.holds[id] = { expiresAt: now + LEASE, slots };
  });
  Object.assign(scope, { owner, id, purpose });
}

export async function runReservedProvider<T extends { model: string; usage: ModelUsage }>(provider: ModelProvider, model: string, execute: () => Promise<T>): Promise<T> {
  const scope = scopes.getStore();
  if (!scope?.owner || !scope.id || !scope.purpose) throw new Error("Provider call requires a model budget reservation.");
  const { owner, id, purpose } = scope;
  const index = await mutate(owner, (state, now) => {
    const hold = state.holds[id];
    const index = hold?.slots.findIndex((slot) => slot?.provider === provider && slot.model === model && slot.startedAt === undefined) ?? -1;
    if (index < 0) throw new ModelBudgetError("MODEL_RESERVATION_EXPIRED", "The model reservation expired. Retry the batch.", 1);
    hold.slots[index]!.startedAt = now;
    hold.expiresAt = now + LEASE;
    state.calls.push(now);
    return index;
  });
  const result = await execute();
  const cost = estimateModelCost(provider, result.model, result.usage);
  await mutate(owner, (state, now) => {
    const hold = state.holds[id];
    const slot = hold?.slots[index];
    if (!slot) throw new Error("Model reservation was lost before settlement.");
    charge(state, now, cost.estimatedUsd ?? slot.usd, cost.estimatedUsd === null);
    hold.slots[index] = null;
    hold.expiresAt = now + LEASE;
  }, { id: `${id}-${index}`, purpose, provider, model: result.model, usage: result.usage, cost });
  return result;
}

/** Finally releases unstarted calls; uncertain started calls retain their estimate. */
export function budgetedRoute(handler: (request: Request) => Promise<Response>) {
  return (request: Request) => scopes.run({}, async () => {
    try { return await handler(request); }
    finally {
      const scope = scopes.getStore()!;
      if (scope.owner && scope.id) {
        const { owner, id } = scope;
        await mutate(owner, (state, now) => {
          const hold = state.holds[id];
          for (const slot of hold?.slots ?? []) if (slot?.startedAt !== undefined) charge(state, now, slot.usd);
          delete state.holds[id];
        }).catch(() => undefined); // If storage is down, the lease recovers lazily.
      }
    }
  });
}
