import { afterEach, expect, it, vi } from "vitest";
import { getDb } from "../../db";
import { eq } from "../../db/firestore-orm";
import { labAttempts, modelRuns, modelBudgetLedgers, modelUsageEvents } from "../../db/schema";
import { assertModelBudget, budgetedRoute, currentUsage, runReservedProvider } from "../../app/lib/model-budget";
import { estimateModelCost } from "../../app/lib/model-pricing";
import { deleteLearnerData } from "../../app/lib/account-erasure";
import { executeModelProvider } from "../../app/lib/model-providers";

const plan = { provider: "gemini" as const, model: "gemini-3.5-flash-lite" };
const modelUsage = { inputTokens: 1000, outputTokens: 50, totalTokens: 1050, cachedInputTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };
const result = { model: plan.model, usage: modelUsage };
const owners: string[] = [];
const owner = () => { const email = `budget-${crypto.randomUUID()}@example.com`; owners.push(email); return email; };
const scoped = (work: () => Promise<void>) => budgetedRoute(async () => { await work(); return Response.json({ ok: true }); })(new Request("http://localhost/test"));
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const email of owners.splice(0)) {
    await getDb().delete(modelBudgetLedgers).where(eq(modelBudgetLedgers.ownerEmail, email));
    await getDb().delete(modelUsageEvents).where(eq(modelUsageEvents.ownerEmail, email));
  }
});

async function contenders(email: string, total: number) {
  let finishedAdmission = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return Promise.allSettled(Array.from({ length: total }, () => scoped(async () => {
    try { await assertModelBudget(email, [plan], "workbench"); }
    finally { if (++finishedAdmission === total) release(); }
    await gate;
  })));
}

it("atomically admits only the available concurrent call slots", async () => {
  vi.stubEnv("MODEL_RATE_LIMIT_PER_MINUTE", "2");
  vi.stubEnv("MODEL_DAILY_USD_CAP", "5");
  const email = owner();
  const outcomes = await contenders(email, 6);
  expect(outcomes.filter((row) => row.status === "fulfilled")).toHaveLength(2);
  expect((await currentUsage(email)).callsLastMinute).toBe(0); // No call started.
});

it("reserves spend across concurrent requests before any call completes", async () => {
  vi.stubEnv("MODEL_RATE_LIMIT_PER_MINUTE", "30");
  vi.stubEnv("MODEL_DAILY_USD_CAP", "0.05");
  const outcomes = await contenders(owner(), 3);
  expect(outcomes.filter((row) => row.status === "fulfilled")).toHaveLength(1);
});

it("settles actual usage once even if later response processing fails", async () => {
  const email = owner();
  await expect(scoped(async () => {
    await assertModelBudget(email, [plan, plan], "judge");
    await runReservedProvider(plan.provider, plan.model, async () => result);
    throw new Error("artifact parsing failed");
  })).rejects.toThrow("artifact parsing failed");
  const usage = await currentUsage(email);
  expect(usage.callsLastMinute).toBe(1);
  expect(usage.spentUsdLastDay).toBeCloseTo(estimateModelCost(plan.provider, plan.model, modelUsage).estimatedUsd!);
  expect(await getDb().select().from(modelUsageEvents).where(eq(modelUsageEvents.ownerEmail, email))).toHaveLength(1);
});

it("retains uncertain spend for a failed call and releases unused batch slots", async () => {
  const email = owner();
  await expect(scoped(async () => {
    await assertModelBudget(email, [plan, plan], "regression");
    await runReservedProvider(plan.provider, plan.model, async () => { throw new Error("timeout"); });
  })).rejects.toThrow("timeout");
  expect((await currentUsage(email)).callsLastMinute).toBe(1);
  expect((await currentUsage(email)).spentUsdLastDay).toBeGreaterThan(0.04);
});

it("expires an abandoned unstarted reservation without dispatching a provider", async () => {
  const email = owner();
  const clock = Date.now();
  const dispatch = vi.fn(async () => result);
  await expect(scoped(async () => {
    await assertModelBudget(email, [plan], "workbench");
    vi.spyOn(Date, "now").mockReturnValue(clock + 241_000);
    await runReservedProvider(plan.provider, plan.model, dispatch);
  })).rejects.toMatchObject({ code: "MODEL_RESERVATION_EXPIRED" });
  expect(dispatch).not.toHaveBeenCalled();
  expect((await currentUsage(email)).spentUsdLastDay).toBe(0);
});

it("keeps uncertain spend when a started call outlives its lease", async () => {
  const email = owner();
  const clock = Date.now();
  await expect(scoped(async () => {
    await assertModelBudget(email, [plan], "workbench");
    await runReservedProvider(plan.provider, plan.model, async () => {
      vi.spyOn(Date, "now").mockReturnValue(clock + 241_000);
      throw new Error("worker stopped");
    });
  })).rejects.toThrow("worker stopped");
  expect((await currentUsage(email)).spentUsdLastDay).toBeGreaterThan(0.04);
});

it("rejects unknown prices under a cap and allows explicit unmetered operation without one", async () => {
  const email = owner();
  const unknown = { ...plan, model: "unpriced-model" };
  vi.stubEnv("MODEL_DAILY_USD_CAP", "5");
  await expect(scoped(() => assertModelBudget(email, [unknown], "workbench"))).rejects.toMatchObject({ code: "MODEL_PRICING_UNAVAILABLE" });
  vi.stubEnv("MODEL_DAILY_USD_CAP", "0");
  await scoped(async () => {
    await assertModelBudget(email, [unknown], "workbench");
    await runReservedProvider(plan.provider, unknown.model, async () => ({ ...result, model: unknown.model }));
  });
  const [event] = await getDb().select().from(modelUsageEvents).where(eq(modelUsageEvents.ownerEmail, email));
  expect(event.estimatedUsd).toBeNull();
});

it("seeds existing usage and refuses a batch without partial dispatch", async () => {
  const email = owner();
  vi.stubEnv("MODEL_RATE_LIMIT_PER_MINUTE", "2");
  await getDb().insert(modelUsageEvents).values({ id: crypto.randomUUID(), ownerEmail: email, purpose: "workbench", provider: plan.provider, model: plan.model, estimatedUsd: 0.01 });
  await expect(scoped(() => assertModelBudget(email, [plan, plan], "judge"))).rejects.toMatchObject({ code: "MODEL_RATE_LIMITED" });
});

it("does not recreate budget data after account erasure", async () => {
  const email = owner();
  await scoped(async () => {
    await assertModelBudget(email, [plan], "workbench");
    await deleteLearnerData(email);
    await expect(runReservedProvider(plan.provider, plan.model, async () => result)).rejects.toThrow("Account was erased");
  });
  expect(await getDb().select().from(modelBudgetLedgers).where(eq(modelBudgetLedgers.ownerEmail, email))).toEqual([]);
});

it("never retries an ambiguous transport failure", async () => {
  const email = owner();
  vi.stubEnv("GEMINI_API_KEY", "test-only"); vi.stubEnv("GEMINI_MODEL", plan.model);
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("socket lost"));
  await expect(scoped(async () => {
    await assertModelBudget(email, [plan], "workbench");
    await executeModelProvider(plan.provider, { attemptId: "test", labId: "lab-01", prompt: "test", sourceText: "test" });
  })).rejects.toMatchObject({ code: "MODEL_REQUEST_FAILED" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("connects the workbench route to reservation, provider dispatch, and settlement", async () => {
  const email = owner();
  const attemptId = crypto.randomUUID();
  vi.stubEnv("GEMINI_API_KEY", "test-only"); vi.stubEnv("GEMINI_MODEL", plan.model);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
    modelVersion: plan.model, candidates: [{ content: { parts: [{ text: "Evidence-grounded result" }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 50, totalTokenCount: 1050 },
  }));
  await getDb().insert(labAttempts).values({ id: attemptId, ownerEmail: email, labId: "lab-01" });
  try {
    const { POST } = await import("../../app/api/model-runs/route");
    const response = await POST(new Request("http://localhost:3100/api/model-runs", {
      method: "POST", headers: { "content-type": "application/json", "oai-authenticated-user-email": email },
      body: JSON.stringify({ attemptId, provider: plan.provider, prompt: "Extract facts", selectedSources: ["NW-ROADMAP-03"] }),
    }));
    expect(response.status).toBe(201);
    expect((await currentUsage(email)).callsLastMinute).toBe(1);
    expect(await getDb().select().from(modelUsageEvents).where(eq(modelUsageEvents.ownerEmail, email))).toHaveLength(1);
  } finally {
    await getDb().delete(modelRuns).where(eq(modelRuns.attemptId, attemptId));
    await getDb().delete(labAttempts).where(eq(labAttempts.id, attemptId));
  }
});
