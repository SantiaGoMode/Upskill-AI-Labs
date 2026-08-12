import { and, desc, eq } from "../../../db/firestore-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { labAttempts, modelRuns } from "../../../db/schema";
import { labSources } from "../../lab-data";
import { curriculumSource } from "../../curriculum-data";
import { estimateModelCost } from "../../lib/model-pricing";
import { assertModelBudget, budgetErrorResponse, ModelBudgetError, recordModelUsage } from "../../lib/model-budget";
import { executeModelProvider, getProviderStatuses, ProviderError } from "../../lib/model-providers";
import { serverErrorResponse } from "../../lib/observability";
import { MAX_PROMPT_CHARS, MAX_SELECTED_SOURCES, readJsonBody } from "../../lib/request-limits";
import { getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";
import { activePolicy, permitsDataClass, permitsProvider } from "../../lib/governance";
import {
  isModelProvider,
  type ModelCost,
  type ModelProvider,
  type ModelRunTrace,
  type ModelUsage,
  type PersistedModelRun,
} from "../../lib/model-run-types";

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toModelRun(row: typeof modelRuns.$inferSelect): PersistedModelRun {
  const usage = parseJson<Partial<ModelUsage>>(row.usageJson, {});
  const cost = parseJson<Partial<ModelCost>>(row.costJson, {});
  const storedTrace = parseJson<Partial<ModelRunTrace>>(row.traceJson, {});
  const endpoint = storedTrace.endpoint ?? "responses";
  const provider = storedTrace.provider ?? (
    endpoint === "generateContent" ? "gemini"
      : endpoint === "messages" ? "anthropic"
        : endpoint === "chat" ? "ollama"
          : "openai"
  );
  return {
    id: row.id,
    attemptId: row.attemptId,
    provider,
    model: row.model,
    outputText: row.outputText,
    trace: {
      responseId: storedTrace.responseId ?? row.responseId,
      provider,
      endpoint,
      status: storedTrace.status ?? row.status,
      startedAt: storedTrace.startedAt ?? row.createdAt,
      completedAt: storedTrace.completedAt ?? row.createdAt,
      durationMs: storedTrace.durationMs ?? 0,
      sourceIds: storedTrace.sourceIds ?? [],
    },
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      cachedInputTokens: usage.cachedInputTokens ?? 0,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      reasoningTokens: usage.reasoningTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    },
    cost: {
      currency: "USD",
      estimatedUsd: cost.estimatedUsd ?? null,
      inputRatePerMillion: cost.inputRatePerMillion ?? null,
      cachedInputRatePerMillion: cost.cachedInputRatePerMillion ?? null,
      cacheWriteRatePerMillion: cost.cacheWriteRatePerMillion ?? null,
      outputRatePerMillion: cost.outputRatePerMillion ?? null,
      pricingBasis: cost.pricingBasis ?? "Pricing unavailable",
    },
    createdAt: row.createdAt,
  };
}

function sourceText(labId: string, sourceIds: string[]) {
  return sourceIds.map((sourceId) => {
    const source = labId === "lab-01"
      ? labSources.find((candidate) => candidate.id === sourceId)
      : curriculumSource(labId, sourceId);
    if (!source || source.classification !== "Internal") return null;

    const sections = source.sections.map((section) => [
      section.heading,
      ...(section.paragraphs ?? []),
      ...(section.bullets ?? []).map((bullet) => `- ${bullet}`),
    ].filter(Boolean).join("\n")).join("\n\n");
    return `SOURCE ${source.id}: ${source.title}\n${sections}`;
  }).filter((value): value is string => Boolean(value)).join("\n\n---\n\n");
}

export async function GET(request: Request) {
  try {
    await ensureLabSchema();
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorizedResponse();
    const searchParams = new URL(request.url).searchParams;
    if (searchParams.get("config") === "providers") {
      const policy = await activePolicy();
      return Response.json({ providers: getProviderStatuses().map((provider) => ({
        ...provider,
        allowed: permitsProvider(policy, provider.provider),
        configured: provider.configured && permitsProvider(policy, provider.provider),
      })), policy: { id: policy.id, name: policy.name, version: policy.version } });
    }
    const attemptId = searchParams.get("attemptId");
    if (!attemptId) return Response.json({ error: "attemptId is required" }, { status: 400 });

    const db = getDb();
    const [attempt] = await db.select({ id: labAttempts.id }).from(labAttempts)
      .where(and(eq(labAttempts.id, attemptId), eq(labAttempts.ownerEmail, identity.email))).limit(1);
    if (!attempt) return Response.json({ error: "Attempt not found" }, { status: 404 });
    const [row] = await db
      .select()
      .from(modelRuns)
      .where(eq(modelRuns.attemptId, attemptId))
      .orderBy(desc(modelRuns.createdAt))
      .limit(1);

    return Response.json({ run: row ? toModelRun(row) : null });
  } catch (error) {
    return serverErrorResponse("model-runs.get", error, "The model run could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    await ensureLabSchema();
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorizedResponse();
    const parsed = await readJsonBody<{
      attemptId?: string;
      prompt?: string;
      selectedSources?: string[];
      provider?: ModelProvider;
    }>(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    const attemptId = body.attemptId?.trim() ?? "";
    const prompt = body.prompt?.trim() ?? "";
    const selectedSources = Array.from(new Set(body.selectedSources ?? []));
    const provider = body.provider ?? "gemini";

    if (!attemptId || !prompt || selectedSources.length === 0) {
      return Response.json(
        { error: "attemptId, prompt, and at least one source are required" },
        { status: 400 },
      );
    }
    // The daily spend cap refuses the call *after* the one that crossed it, so a
    // single unbounded prompt would otherwise be billed in full before any
    // ceiling applied. Bound the request itself rather than truncating it: a
    // silently shortened prompt would produce a run record that misdescribes
    // what actually ran.
    if (prompt.length > MAX_PROMPT_CHARS) {
      return Response.json(
        { error: `A prompt may be at most ${MAX_PROMPT_CHARS.toLocaleString()} characters` },
        { status: 413 },
      );
    }
    if (selectedSources.length > MAX_SELECTED_SOURCES) {
      return Response.json(
        { error: `Select at most ${MAX_SELECTED_SOURCES} sources for one run` },
        { status: 400 },
      );
    }
    if (!isModelProvider(provider)) {
      return Response.json({ error: "Unsupported model provider" }, { status: 400 });
    }
    const policy = await activePolicy();
    if (!permitsProvider(policy, provider)) {
      return Response.json({ error: `${provider} is not approved by the active governance policy` }, { status: 403 });
    }

    const db = getDb();
    const [attempt] = await db.select({ id: labAttempts.id, labId: labAttempts.labId }).from(labAttempts)
      .where(and(eq(labAttempts.id, attemptId), eq(labAttempts.ownerEmail, identity.email))).limit(1);
    if (!attempt) return Response.json({ error: "Attempt not found" }, { status: 404 });
    const selectedSourceRecords = selectedSources.map((sourceId) => attempt.labId === "lab-01"
      ? labSources.find((source) => source.id === sourceId)
      : curriculumSource(attempt.labId, sourceId));
    const normalizedClass = (classification: string) => classification === "Internal" ? "Internal" : "Confidential";
    if (selectedSourceRecords.some((source) => !source || !permitsDataClass(policy, normalizedClass(source.classification)))) {
      return Response.json(
        { error: "The request includes a source that is not permitted in this AI workbench" },
        { status: 400 },
      );
    }

    await assertModelBudget(identity.email);

    const startedAt = new Date();
    const started = performance.now();
    const result = await executeModelProvider(provider, {
      attemptId,
      labId: attempt.labId,
      prompt,
      sourceText: sourceText(attempt.labId, selectedSources),
    });
    const completedAt = new Date();
    const cost = estimateModelCost(provider, result.model, result.usage);
    await recordModelUsage({ ownerEmail: identity.email, purpose: "workbench", provider, model: result.model, usage: result.usage, cost });
    const trace: ModelRunTrace = {
      responseId: result.responseId,
      provider,
      endpoint: result.endpoint,
      status: result.status,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: Math.round(performance.now() - started),
      sourceIds: selectedSources,
    };
    const id = crypto.randomUUID();
    const [row] = await db.insert(modelRuns).values({
      id,
      attemptId,
      responseId: result.responseId,
      model: result.model,
      status: trace.status,
      outputText: result.outputText,
      traceJson: JSON.stringify(trace),
      usageJson: JSON.stringify(result.usage),
      costJson: JSON.stringify(cost),
    }).returning();

    return Response.json({ run: toModelRun(row) }, { status: 201 });
  } catch (error) {
    if (error instanceof ModelBudgetError) return budgetErrorResponse(error);
    if (error instanceof ProviderError) {
      return Response.json({ code: error.code, error: error.message }, { status: error.status });
    }
    return serverErrorResponse("model-runs.post", error, "The model run could not be completed.");
  }
}
