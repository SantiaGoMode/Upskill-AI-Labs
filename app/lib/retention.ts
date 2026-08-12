import { and, eq, inArray, lt, sql } from "../../db/firestore-orm";
import { getDb } from "../../db";
import {
  capabilityClaims,
  evalResults,
  judgeResults,
  labAttempts,
  labSubmissions,
  lessonProgress,
  liveRoomBoardCards,
  localSessions,
  localUsers,
  modelRuns,
  modelUsageEvents,
  redactionExperiments,
  regressionRuns,
  scoreAppeals,
  workflowBaselines,
  workflowMaps,
  workflowMeasurements,
} from "../../db/schema";
import { activePolicy, recordAudit } from "./governance";
import { logInfo } from "./observability";
import { chunkIds, selectInChunks } from "./sql-chunks";

/**
 * Retention and data-subject operations.
 *
 * The governance policy's `promptRetentionDays` governs *prompt and model-response*
 * records: what was sent to a provider and what came back. It deliberately does not
 * cover submitted artifacts, evaluations, or capability claims, which are assessment
 * evidence with their own lifecycle (claims expire after 180 days) and which a
 * learner is entitled to keep as proof of capability.
 */

export type PurgeCounts = Record<string, number>;

const cutoffIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/**
 * Deletes prompt and model-response records older than the active policy's
 * retention window. Safe to run repeatedly; returns what it removed.
 */
export async function purgeExpiredPromptData(): Promise<{ retentionDays: number; deleted: PurgeCounts }> {
  const policy = await activePolicy();
  const db = getDb();
  const deleted: PurgeCounts = {};

  // Expired sessions are housekeeping and are removed regardless of the window.
  const sessions = await db.delete(localSessions)
    .where(lt(localSessions.expiresAt, new Date().toISOString())).returning({ id: localSessions.id });
  deleted.localSessions = sessions.length;

  // A retention window of zero disables time-based purging of model records.
  if (policy.promptRetentionDays > 0) {
    const cutoff = cutoffIso(policy.promptRetentionDays);
    const [runs, judges, regressions, cards, usage] = await db.batch([
      db.delete(modelRuns).where(lt(modelRuns.createdAt, cutoff)).returning({ id: modelRuns.id }),
      db.delete(judgeResults).where(lt(judgeResults.createdAt, cutoff)).returning({ id: judgeResults.id }),
      db.delete(regressionRuns).where(lt(regressionRuns.createdAt, cutoff)).returning({ id: regressionRuns.id }),
      db.delete(liveRoomBoardCards).where(lt(liveRoomBoardCards.createdAt, cutoff)).returning({ id: liveRoomBoardCards.id }),
      db.delete(modelUsageEvents).where(lt(modelUsageEvents.createdAt, cutoff)).returning({ id: modelUsageEvents.id }),
    ]);
    deleted.modelRuns = runs.length;
    deleted.judgeResults = judges.length;
    deleted.regressionRuns = regressions.length;
    deleted.liveRoomBoardCards = cards.length;
    deleted.modelUsageEvents = usage.length;
  }

  const total = Object.values(deleted).reduce((sum, count) => sum + count, 0);
  logInfo("retention_purge_completed", { retentionDays: policy.promptRetentionDays, deletedRows: total });

  return { retentionDays: policy.promptRetentionDays, deleted };
}

/**
 * Everything the application holds for one learner, for a data-subject request.
 *
 * Owner-keyed tables are read concurrently. The id-keyed reads are chunked to stay
 * inside Firestore's `in` query value limit.
 */
export async function exportLearnerData(email: string) {
  const db = getDb();

  const [attempts, appeals, regressions, maps, experiments, baselines, measurements, claims, progress, usage] =
    await db.batch([
      db.select().from(labAttempts).where(eq(labAttempts.ownerEmail, email)),
      db.select().from(scoreAppeals).where(eq(scoreAppeals.ownerEmail, email)),
      db.select().from(regressionRuns).where(eq(regressionRuns.ownerEmail, email)),
      db.select().from(workflowMaps).where(eq(workflowMaps.ownerEmail, email)),
      db.select().from(redactionExperiments).where(eq(redactionExperiments.ownerEmail, email)),
      db.select().from(workflowBaselines).where(eq(workflowBaselines.ownerEmail, email)),
      db.select().from(workflowMeasurements).where(eq(workflowMeasurements.ownerEmail, email)),
      db.select().from(capabilityClaims).where(eq(capabilityClaims.ownerEmail, email)),
      db.select().from(lessonProgress).where(eq(lessonProgress.ownerEmail, email)),
      db.select().from(modelUsageEvents).where(eq(modelUsageEvents.ownerEmail, email)),
    ]);

  const attemptIds = attempts.map((attempt) => attempt.id);
  const submissions = await selectInChunks(attemptIds, (batch) =>
    db.select().from(labSubmissions).where(inArray(labSubmissions.attemptId, batch)));
  const submissionIds = submissions.map((submission) => submission.id);

  const evaluations = await selectInChunks(submissionIds, (batch) =>
    db.select().from(evalResults).where(inArray(evalResults.submissionId, batch)));
  const judges = await selectInChunks(submissionIds, (batch) =>
    db.select().from(judgeResults).where(inArray(judgeResults.submissionId, batch)));
  const runs = await selectInChunks(attemptIds, (batch) =>
    db.select().from(modelRuns).where(inArray(modelRuns.attemptId, batch)));

  return {
    exportedAt: new Date().toISOString(),
    email,
    attempts,
    submissions,
    evaluations,
    judgeResults: judges,
    modelRuns: runs,
    appeals,
    regressionRuns: regressions,
    workflowMaps: maps,
    redactionExperiments: experiments,
    workflowBaselines: baselines,
    workflowMeasurements: measurements,
    capabilityClaims: claims,
    lessonProgress: progress,
    modelUsageEvents: usage,
  };
}

/** Every count an erasure reports, so the response shape does not depend on the data. */
const ERASURE_LABELS = [
  "evaluations", "judgeResults", "modelRuns", "appeals", "regressionRuns", "submissions", "attempts",
  "measurements", "baselines", "redactionExperiments", "workflowMaps", "capabilityClaims", "lessonProgress",
  "modelUsageEvents", "liveRoomBoardCards", "sessions", "account",
] as const;

/**
 * Erases one learner's records. Facilitator-authored governance history is not a
 * learner record and is left in place: the audit trail keeps a single event noting
 * that this account was erased, which is what makes the erasure itself auditable.
 */
export async function deleteLearnerData(email: string): Promise<PurgeCounts> {
  const db = getDb();

  const attempts = await db.select({ id: labAttempts.id }).from(labAttempts).where(eq(labAttempts.ownerEmail, email));
  const attemptIds = attempts.map((attempt) => attempt.id);
  const submissionIds = (await selectInChunks(attemptIds, (batch) =>
    db.select({ id: labSubmissions.id }).from(labSubmissions).where(inArray(labSubmissions.attemptId, batch))
  )).map((submission) => submission.id);

  // Child-first and chunked so no query exceeds Firestore's value limit. Erasure is
  // idempotent: if a transient failure interrupts it, retrying finishes the remainder.
  const deletions: Array<{ label: string; statement: unknown }> = [];
  const add = (label: string, statement: unknown) => deletions.push({ label, statement });

  for (const batch of chunkIds(submissionIds)) {
    add("evaluations", db.delete(evalResults).where(inArray(evalResults.submissionId, batch)).returning({ id: evalResults.id }));
    add("judgeResults", db.delete(judgeResults).where(inArray(judgeResults.submissionId, batch)).returning({ id: judgeResults.id }));
  }
  for (const batch of chunkIds(attemptIds)) {
    add("modelRuns", db.delete(modelRuns).where(inArray(modelRuns.attemptId, batch)).returning({ id: modelRuns.id }));
  }
  add("appeals", db.delete(scoreAppeals).where(eq(scoreAppeals.ownerEmail, email)).returning({ id: scoreAppeals.id }));
  add("regressionRuns", db.delete(regressionRuns).where(eq(regressionRuns.ownerEmail, email)).returning({ id: regressionRuns.id }));
  for (const batch of chunkIds(submissionIds)) {
    add("submissions", db.delete(labSubmissions).where(inArray(labSubmissions.id, batch)).returning({ id: labSubmissions.id }));
  }
  add("attempts", db.delete(labAttempts).where(eq(labAttempts.ownerEmail, email)).returning({ id: labAttempts.id }));
  add("measurements", db.delete(workflowMeasurements).where(eq(workflowMeasurements.ownerEmail, email)).returning({ id: workflowMeasurements.id }));
  add("baselines", db.delete(workflowBaselines).where(eq(workflowBaselines.ownerEmail, email)).returning({ id: workflowBaselines.id }));
  add("redactionExperiments", db.delete(redactionExperiments).where(eq(redactionExperiments.ownerEmail, email)).returning({ id: redactionExperiments.id }));
  add("workflowMaps", db.delete(workflowMaps).where(eq(workflowMaps.ownerEmail, email)).returning({ id: workflowMaps.id }));
  add("capabilityClaims", db.delete(capabilityClaims).where(eq(capabilityClaims.ownerEmail, email)).returning({ id: capabilityClaims.id }));
  add("lessonProgress", db.delete(lessonProgress).where(eq(lessonProgress.ownerEmail, email)).returning({ id: lessonProgress.id }));
  add("modelUsageEvents", db.delete(modelUsageEvents).where(eq(modelUsageEvents.ownerEmail, email)).returning({ id: modelUsageEvents.id }));
  add("liveRoomBoardCards", db.delete(liveRoomBoardCards).where(eq(liveRoomBoardCards.authorEmail, email)).returning({ id: liveRoomBoardCards.id }));
  add("sessions", db.delete(localSessions).where(eq(localSessions.userEmail, email)).returning({ id: localSessions.id }));
  add("account", db.delete(localUsers).where(eq(localUsers.email, email)).returning({ email: localUsers.email }));

  type BatchArgument = Parameters<typeof db.batch>[0];
  const results = await db.batch(deletions.map((deletion) => deletion.statement) as unknown as BatchArgument);

  const deleted: PurgeCounts = Object.fromEntries(ERASURE_LABELS.map((label) => [label, 0]));
  results.forEach((rows, index) => {
    const label = deletions[index].label;
    deleted[label] = (deleted[label] ?? 0) + (rows as unknown[]).length;
  });

  await recordAudit(email, "account.erased", "learner", email, {
    deletedRows: Object.values(deleted).reduce((sum, count) => sum + count, 0),
  });

  return deleted;
}

/** Counts what a purge would remove, for the governance page to display. */
export async function retentionPreview() {
  const policy = await activePolicy();
  if (policy.promptRetentionDays <= 0) {
    return { retentionDays: policy.promptRetentionDays, expiring: 0 };
  }
  const cutoff = cutoffIso(policy.promptRetentionDays);
  const [runs] = await getDb().select({ count: sql<number>`count(*)` }).from(modelRuns)
    .where(and(lt(modelRuns.createdAt, cutoff)));
  return { retentionDays: policy.promptRetentionDays, expiring: Number(runs?.count ?? 0) };
}
