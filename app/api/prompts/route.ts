import { desc, eq, inArray } from "../../../db/firestore-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { labAttempts, modelRuns, regressionRuns } from "../../../db/schema";
import { getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";
import { selectInChunks } from "../../lib/sql-chunks";
import { demoPromptEntries, isDemoViewer } from "../../lib/demo-record";

/**
 * Backs the prompt library. Everything here is derived from work the learner
 * actually did — attempt prompts plus the regression evidence attached to them —
 * so a prompt is only ever listed alongside how reliably it performed.
 */

const parse = <T,>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

type RegressionResult = { passed: number; total: number; criticalFailures: number; promotionReady: boolean };

export async function GET(request: Request) {
  const identity = await getRequestIdentity(request);
  if (!identity) return unauthorizedResponse();
  if (isDemoViewer(identity)) return Response.json({ entries: demoPromptEntries });
  await ensureLabSchema();

  const db = getDb();
  const attempts = await db
    .select()
    .from(labAttempts)
    .where(eq(labAttempts.ownerEmail, identity.email))
    .orderBy(desc(labAttempts.updatedAt));

  const owned = attempts.filter((attempt) => attempt.prompt.trim());
  const attemptIds = new Set(owned.map((attempt) => attempt.id));

  const batches = (
    await db.select().from(regressionRuns).where(eq(regressionRuns.ownerEmail, identity.email)).orderBy(desc(regressionRuns.createdAt))
  ).map((row) => ({ ...row, result: parse<RegressionResult | null>(row.resultJson, null) }));

  // Scoped to the caller's own attempts. Reading the whole table and filtering in
  // the worker returns the same list, but pulls every learner's run rows through
  // this isolate to do it.
  const runs = await selectInChunks([...attemptIds], (batch) =>
    db.select({ attemptId: modelRuns.attemptId, model: modelRuns.model, createdAt: modelRuns.createdAt })
      .from(modelRuns).where(inArray(modelRuns.attemptId, batch)).orderBy(desc(modelRuns.createdAt)));

  const entries = owned.map((attempt) => {
    const attemptBatches = batches.filter((batch) => batch.attemptId === attempt.id);
    const bestLive = attemptBatches.find((batch) => batch.mode === "live");
    const latestBatch = bestLive ?? attemptBatches[0] ?? null;
    const attemptRuns = runs.filter((run) => run.attemptId === attempt.id);
    return {
      attemptId: attempt.id,
      labId: attempt.labId,
      prompt: attempt.prompt,
      status: attempt.status,
      selectedSources: parse<string[]>(attempt.selectedSourcesJson, []),
      updatedAt: attempt.updatedAt,
      modelRunCount: attemptRuns.length,
      lastModel: attemptRuns[0]?.model ?? null,
      reliability: latestBatch?.result
        ? {
            mode: latestBatch.mode,
            provider: latestBatch.provider,
            passed: latestBatch.result.passed,
            total: latestBatch.result.total,
            criticalFailures: latestBatch.result.criticalFailures,
            promotionReady: latestBatch.result.promotionReady,
            ranAt: latestBatch.createdAt,
          }
        : null,
    };
  });

  return Response.json({ entries });
}
