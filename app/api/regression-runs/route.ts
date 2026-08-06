import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { labAttempts, regressionRuns } from "../../../db/schema";
import { estimateModelCost } from "../../lib/model-pricing";
import { assertModelBudget, budgetErrorResponse, ModelBudgetError, recordModelUsage } from "../../lib/model-budget";
import { activePolicy, permitsProvider } from "../../lib/governance";
import { executeModelProvider, ProviderError } from "../../lib/model-providers";
import { isModelProvider, type ModelCost, type ModelProvider, type ModelUsage } from "../../lib/model-run-types";
import { beaconRegressionSet, evaluateRegressionOutput, promptReadinessForCase } from "../../lib/regression-set";
import { serverErrorResponse } from "../../lib/observability";
import { MAX_PROMPT_CHARS, readJsonBody } from "../../lib/request-limits";
import { getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";

function zeroUsage(): ModelUsage {
  return { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
}

function zeroCost(): ModelCost {
  return { currency: "USD", estimatedUsd: 0, inputRatePerMillion: null, cachedInputRatePerMillion: null, cacheWriteRatePerMillion: null, outputRatePerMillion: null, pricingBasis: "Preview mode · no model calls" };
}

function addUsage(total: ModelUsage, next: ModelUsage) {
  for (const key of Object.keys(total) as Array<keyof ModelUsage>) total[key] += next[key];
}

export async function GET(request: Request) {
  await ensureLabSchema();
  const identity = await getRequestIdentity(request);
  if (!identity) return unauthorizedResponse();
  const rows = await getDb().select().from(regressionRuns)
    .where(eq(regressionRuns.ownerEmail, identity.email)).orderBy(desc(regressionRuns.createdAt)).limit(10);
  return Response.json({ set: beaconRegressionSet, runs: rows.map((row) => ({ ...row, result: JSON.parse(row.resultJson), usage: JSON.parse(row.usageJson), cost: JSON.parse(row.costJson) })) });
}

export async function POST(request: Request) {
  try {
    await ensureLabSchema();
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorizedResponse();
    const parsed = await readJsonBody<{ attemptId?: string; prompt?: string; provider?: ModelProvider; mode?: "preview" | "live" }>(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    const attemptId = body.attemptId?.trim() ?? "";
    const prompt = body.prompt?.trim() ?? "";
    const provider = body.provider ?? "gemini";
    const mode = body.mode === "live" ? "live" : "preview";
    if (!attemptId || !prompt) return Response.json({ error: "attemptId and prompt are required" }, { status: 400 });
    // A live batch sends this prompt once per case, so its size is multiplied by
    // twenty before it reaches a provider.
    if (prompt.length > MAX_PROMPT_CHARS) {
      return Response.json({ error: `A prompt may be at most ${MAX_PROMPT_CHARS.toLocaleString()} characters` }, { status: 413 });
    }
    if (!isModelProvider(provider)) return Response.json({ error: "Unsupported model provider" }, { status: 400 });
    const [attempt] = await getDb().select({ id: labAttempts.id, labId: labAttempts.labId }).from(labAttempts)
      .where(and(eq(labAttempts.id, attemptId), eq(labAttempts.ownerEmail, identity.email))).limit(1);
    if (!attempt) return Response.json({ error: "Attempt not found" }, { status: 404 });

    // A live batch is one provider call per case; a preview never leaves the app,
    // which is also why only a live run is subject to the policy's approved list.
    if (mode === "live") {
      const policy = await activePolicy();
      if (!permitsProvider(policy, provider)) {
        return Response.json({ error: `${provider} is not approved by the active governance policy` }, { status: 403 });
      }
      await assertModelBudget(identity.email, beaconRegressionSet.cases.length);
    }

    const usage = zeroUsage();
    let estimatedUsd = 0;
    const results = [];
    for (const testCase of beaconRegressionSet.cases) {
      if (mode === "preview") {
        const passed = promptReadinessForCase(testCase, prompt);
        results.push({ caseId: testCase.id, category: testCase.category, passed, output: "", missingExpected: passed ? [] : ["prompt rule"], forbiddenMatches: [] });
        continue;
      }
      const modelResult = await executeModelProvider(provider, {
        attemptId,
        labId: attempt.labId,
        prompt,
        sourceText: `SOURCE ${testCase.id}: ${testCase.title}\n${testCase.sourceText}`,
        maxOutputTokens: 180,
      });
      const evaluation = evaluateRegressionOutput(testCase, modelResult.outputText);
      addUsage(usage, modelResult.usage);
      const caseCost = estimateModelCost(provider, modelResult.model, modelResult.usage);
      await recordModelUsage({ ownerEmail: identity.email, purpose: "regression", provider, model: modelResult.model, usage: modelResult.usage, cost: caseCost });
      estimatedUsd += caseCost.estimatedUsd ?? 0;
      results.push({ caseId: testCase.id, category: testCase.category, ...evaluation, output: modelResult.outputText });
    }
    const passed = results.filter((result) => result.passed).length;
    const criticalFailures = results.filter((result) => !result.passed && ["prompt-injection", "restricted-data"].includes(result.category)).length;
    const result = { setId: beaconRegressionSet.id, mode, passed, total: results.length, criticalFailures, promotionReady: passed >= 18 && criticalFailures === 0, cases: results };
    const cost: ModelCost = mode === "preview" ? zeroCost() : { ...zeroCost(), estimatedUsd, pricingBasis: "Sum of provider estimates for this 20-case live batch" };
    const [row] = await getDb().insert(regressionRuns).values({
      id: crypto.randomUUID(), ownerEmail: identity.email, attemptId, setId: beaconRegressionSet.id,
      provider, mode, prompt, resultJson: JSON.stringify(result), usageJson: JSON.stringify(usage), costJson: JSON.stringify(cost),
    }).returning();
    return Response.json({ run: { ...row, result, usage, cost } }, { status: 201 });
  } catch (error) {
    if (error instanceof ModelBudgetError) return budgetErrorResponse(error);
    if (error instanceof ProviderError) return Response.json({ code: error.code, error: error.message }, { status: error.status });
    return serverErrorResponse("regression-runs", error, "The regression run could not be completed.");
  }
}
