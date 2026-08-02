import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { evalResults, humanReviews, judgeResults, labAttempts, labSubmissions, scoreAppeals } from "../../../db/schema";
import { aggregateJudges, agreementByDimension, isRubricBand, rubricDimensions, type CalibrationPair, type JudgeEvaluation, type JudgeRecord, type RubricDimension } from "../../lib/hybrid-evaluation";
import { estimateModelCost } from "../../lib/model-pricing";
import { executeModelProvider, getProviderStatuses, ProviderError } from "../../lib/model-providers";
import type { ModelProvider } from "../../lib/model-run-types";
import { facilitatorRequiredResponse, getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function parseJudgeOutput(output: string): JudgeEvaluation {
  const candidate = output.match(/\{[\s\S]*\}/)?.[0] ?? output;
  const parsed = JSON.parse(candidate) as Partial<JudgeEvaluation>;
  const dimensions = Object.fromEntries(rubricDimensions.map((dimension) => {
    const value = parsed.dimensions?.[dimension];
    if (!value || !isRubricBand(value.band)) throw new Error(`Judge output is missing a valid ${dimension} band.`);
    return [dimension, { band: value.band, rationale: String(value.rationale ?? ""), evidence: Array.isArray(value.evidence) ? value.evidence.map(String) : [] }];
  })) as JudgeEvaluation["dimensions"];
  return { dimensions, overallRationale: String(parsed.overallRationale ?? "") };
}

const JUDGE_SYSTEM = `You are an independent rubric judge for an AI-workflow training artifact. Grade process quality, not writing style. Use only Developing, Capable, or Strong. Apply these anchors: Developing lacks material evidence or control; Capable is usable with a specific improvement; Strong is traceable, complete, repeatable, and preserves human accountability. Return JSON only with dimensions grounding, completeness, judgment, efficiency, guardrails; each has band, rationale, evidence array. Add overallRationale.`;

async function dashboard() {
  const db = getDb();
  const submissions = await db.select({
    id: labSubmissions.id, attemptId: labSubmissions.attemptId, payloadJson: labSubmissions.payloadJson,
    submittedAt: labSubmissions.submittedAt, ownerEmail: labAttempts.ownerEmail, labId: labAttempts.labId,
  }).from(labSubmissions).innerJoin(labAttempts, eq(labAttempts.id, labSubmissions.attemptId)).orderBy(desc(labSubmissions.submittedAt));
  const deterministicRows = await db.select().from(evalResults);
  const judgeRows = await db.select().from(judgeResults);
  const reviewRows = await db.select().from(humanReviews).orderBy(desc(humanReviews.createdAt));
  const appeals = await db.select().from(scoreAppeals).orderBy(desc(scoreAppeals.createdAt));
  const pairs: CalibrationPair[] = [];
  const items = submissions.map((submission) => {
    const deterministic = deterministicRows.find((row) => row.submissionId === submission.id);
    const judges: JudgeRecord[] = judgeRows.filter((row) => row.submissionId === submission.id).map((row) => ({
      id: row.id, provider: row.provider, model: row.model, judgeIndex: row.judgeIndex,
      ...parseJson<JudgeEvaluation>(row.resultJson, {} as JudgeEvaluation),
    }));
    const human = reviewRows.find((row) => row.submissionId === submission.id);
    const humanResult = human ? parseJson<Record<RubricDimension, "Developing" | "Capable" | "Strong">>(human.resultJson, {} as Record<RubricDimension, "Developing" | "Capable" | "Strong">) : null;
    if (judges.length && humanResult) {
      const ensemble = aggregateJudges(judges);
      pairs.push({ ensemble: Object.fromEntries(rubricDimensions.map((dimension) => [dimension, ensemble.dimensions[dimension].band])) as CalibrationPair["ensemble"], human: humanResult });
    }
    return {
      ...submission,
      payload: parseJson(submission.payloadJson, {}),
      deterministic: deterministic ? parseJson(deterministic.resultJson, null) : null,
      judges,
      humanReview: human ? { ...human, result: humanResult } : null,
      appeals: appeals.filter((appeal) => appeal.submissionId === submission.id),
    };
  });
  const agreement = agreementByDimension(pairs);
  return {
    agreement,
    calibrationPairs: pairs.length,
    threshold: 0.75,
    appealRate: submissions.length ? appeals.length / submissions.length : 0,
    submissions: items.map((item) => ({ ...item, ensemble: item.judges.length ? aggregateJudges(item.judges, agreement) : null })),
  };
}

export async function GET(request: Request) {
  await ensureLabSchema();
  const identity = getRequestIdentity(request);
  if (!identity) return unauthorizedResponse();
  const search = new URL(request.url).searchParams;
  if (search.get("dashboard") === "1") {
    if (identity.role !== "facilitator") return facilitatorRequiredResponse();
    return Response.json(await dashboard());
  }
  const attemptId = search.get("attemptId");
  if (!attemptId) return Response.json({ error: "attemptId is required" }, { status: 400 });
  const submissions = await getDb().select({ id: labSubmissions.id }).from(labSubmissions)
    .innerJoin(labAttempts, eq(labAttempts.id, labSubmissions.attemptId))
    .where(and(eq(labSubmissions.attemptId, attemptId), eq(labAttempts.ownerEmail, identity.email)));
  const ids = new Set(submissions.map((item) => item.id));
  const appeals = (await getDb().select().from(scoreAppeals).where(eq(scoreAppeals.ownerEmail, identity.email))).filter((item) => ids.has(item.submissionId));
  return Response.json({ appeals });
}

export async function POST(request: Request) {
  try {
    await ensureLabSchema();
    const identity = getRequestIdentity(request);
    if (!identity) return unauthorizedResponse();
    const body = await request.json() as {
      action?: "judge" | "human-review" | "appeal" | "resolve-appeal";
      submissionId?: string;
      providers?: ModelProvider[];
      bands?: Partial<Record<RubricDimension, string>>;
      rationale?: string;
      appealId?: string;
      resolution?: string;
      status?: "upheld" | "adjusted" | "rejected";
    };
    if (body.action === "appeal") {
      if (!body.submissionId || !body.rationale?.trim()) return Response.json({ error: "submissionId and appeal reason are required" }, { status: 400 });
      const [owned] = await getDb().select({ id: labSubmissions.id }).from(labSubmissions)
        .innerJoin(labAttempts, eq(labAttempts.id, labSubmissions.attemptId))
        .where(and(eq(labSubmissions.id, body.submissionId), eq(labAttempts.ownerEmail, identity.email))).limit(1);
      if (!owned) return Response.json({ error: "Submission not found" }, { status: 404 });
      const [appeal] = await getDb().insert(scoreAppeals).values({ id: crypto.randomUUID(), submissionId: body.submissionId, ownerEmail: identity.email, reason: body.rationale.trim() }).returning();
      return Response.json({ appeal }, { status: 201 });
    }
    if (identity.role !== "facilitator") return facilitatorRequiredResponse();

    if (body.action === "human-review") {
      if (!body.submissionId || !body.rationale?.trim() || !body.bands || rubricDimensions.some((dimension) => !isRubricBand(body.bands?.[dimension]))) {
        return Response.json({ error: "A valid band for every dimension and a rationale are required" }, { status: 400 });
      }
      const result = Object.fromEntries(rubricDimensions.map((dimension) => [dimension, body.bands?.[dimension]]));
      const [review] = await getDb().insert(humanReviews).values({ id: crypto.randomUUID(), submissionId: body.submissionId, reviewerEmail: identity.email, resultJson: JSON.stringify(result), rationale: body.rationale.trim() }).returning();
      return Response.json({ review, dashboard: await dashboard() }, { status: 201 });
    }

    if (body.action === "resolve-appeal") {
      if (!body.appealId || !body.status || !body.resolution?.trim()) return Response.json({ error: "appealId, status, and resolution are required" }, { status: 400 });
      const [appeal] = await getDb().update(scoreAppeals).set({ status: body.status, resolution: body.resolution.trim(), updatedAt: new Date().toISOString() }).where(eq(scoreAppeals.id, body.appealId)).returning();
      if (!appeal) return Response.json({ error: "Appeal not found" }, { status: 404 });
      return Response.json({ appeal, dashboard: await dashboard() });
    }

    if (body.action === "judge") {
      if (!body.submissionId) return Response.json({ error: "submissionId is required" }, { status: 400 });
      const [submission] = await getDb().select({ payloadJson: labSubmissions.payloadJson, labId: labAttempts.labId }).from(labSubmissions)
        .innerJoin(labAttempts, eq(labAttempts.id, labSubmissions.attemptId)).where(eq(labSubmissions.id, body.submissionId)).limit(1);
      if (!submission) return Response.json({ error: "Submission not found" }, { status: 404 });
      const configured = new Set(getProviderStatuses().filter((provider) => provider.configured).map((provider) => provider.provider));
      const providers = (body.providers?.length ? body.providers : ["gemini", "openai", "anthropic"]).filter((provider) => configured.has(provider)).slice(0, 3);
      if (providers.length !== 3) return Response.json({ error: "Choose three configured judge providers" }, { status: 400 });
      const artifact = JSON.stringify(parseJson(submission.payloadJson, {}), null, 2);
      const calibrationRows = await getDb().select({ resultJson: humanReviews.resultJson, rationale: humanReviews.rationale, payloadJson: labSubmissions.payloadJson })
        .from(humanReviews).innerJoin(labSubmissions, eq(labSubmissions.id, humanReviews.submissionId))
        .orderBy(desc(humanReviews.createdAt)).limit(3);
      const anchors = calibrationRows.length
        ? `\n\nFACILITATOR-CALIBRATED ANCHORS\n${calibrationRows.map((anchor, index) => `Anchor ${index + 1}\nArtifact: ${anchor.payloadJson.slice(0, 1800)}\nHuman bands: ${anchor.resultJson}\nCalibration rationale: ${anchor.rationale}`).join("\n\n")}`
        : "\n\nNo facilitator-calibrated anchors exist yet. Apply the published rubric conservatively.";
      await getDb().delete(judgeResults).where(eq(judgeResults.submissionId, body.submissionId));
      const records = [];
      for (const [index, provider] of providers.entries()) {
        const result = await executeModelProvider(provider, { attemptId: body.submissionId, labId: submission.labId, prompt: `Independently grade this learner artifact.\n\n${artifact}${anchors}`, sourceText: "The artifact includes its own supplied-source record and verification note.", systemInstruction: JUDGE_SYSTEM, maxOutputTokens: 550 });
        const evaluation = parseJudgeOutput(result.outputText);
        const cost = estimateModelCost(provider, result.model, result.usage);
        const [row] = await getDb().insert(judgeResults).values({ id: crypto.randomUUID(), submissionId: body.submissionId, provider, model: result.model, judgeIndex: index + 1, resultJson: JSON.stringify(evaluation), usageJson: JSON.stringify(result.usage), costJson: JSON.stringify(cost) }).returning();
        records.push({ ...row, ...evaluation, usage: result.usage, cost });
      }
      return Response.json({ judges: records, dashboard: await dashboard() }, { status: 201 });
    }
    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    if (error instanceof ProviderError) return Response.json({ code: error.code, error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Evaluation workflow failed" }, { status: 500 });
  }
}
