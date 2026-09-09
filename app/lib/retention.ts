import { and, eq, inArray, lt } from "../../db/firestore-orm";
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
  organizationMembers, cohortEnrollments, liveRoomParticipants, cohortInterventions, cohorts,
  humanReviews, curriculumInstances,
  modelBudgetLedgers,
} from "../../db/schema";
import { activePolicyForOrganization } from "./governance";
import { logInfo } from "./observability";
import { selectInChunks } from "./sql-chunks";

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
export async function purgeExpiredPromptData(organizationId: string, actorEmail: string): Promise<{ retentionDays: number; deleted: PurgeCounts }> {
  const policy = await activePolicyForOrganization(organizationId);
  const db = getDb();
  const deleted: PurgeCounts = {};

  // Shared learners' sessions are not owned by this organization.
  const sessions = await db.delete(localSessions)
    .where(and(eq(localSessions.userEmail, actorEmail), lt(localSessions.expiresAt, new Date().toISOString()))).returning({ id: localSessions.id });
  deleted.localSessions = sessions.length;

  // A retention window of zero disables time-based purging of model records.
  if (policy.promptRetentionDays > 0) {
    const cutoff = cutoffIso(policy.promptRetentionDays);
    for (const [name, table] of Object.entries(retainedTables)) {
      const rows = await db.delete(table).where(and(eq(table.organizationId, organizationId), lt(table.createdAt, cutoff))).returning({ id: table.id });
      deleted[name] = rows.length;
    }
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
  const reviews = await selectInChunks(submissionIds, (batch) =>
    db.select().from(humanReviews).where(inArray(humanReviews.submissionId, batch)));
  const instances = await db.select().from(curriculumInstances).where(eq(curriculumInstances.ownerEmail, email));
  const budgets = await db.select().from(modelBudgetLedgers).where(eq(modelBudgetLedgers.ownerEmail, email));
  const runs = await selectInChunks(attemptIds, (batch) =>
    db.select().from(modelRuns).where(inArray(modelRuns.attemptId, batch)));

  const [memberships, enrollments, presence, interventions, cards, account, sessions, roster] = await Promise.all([
    db.select().from(organizationMembers).where(eq(organizationMembers.email, email)),
    db.select().from(cohortEnrollments).where(eq(cohortEnrollments.learnerEmail, email)),
    db.select().from(liveRoomParticipants).where(eq(liveRoomParticipants.userEmail, email)),
    db.select().from(cohortInterventions).where(eq(cohortInterventions.learnerEmail, email)),
    db.select().from(liveRoomBoardCards).where(eq(liveRoomBoardCards.authorEmail, email)),
    db.select().from(localUsers).where(eq(localUsers.email, email)),
    db.select({ expiresAt: localSessions.expiresAt, createdAt: localSessions.createdAt }).from(localSessions).where(eq(localSessions.userEmail, email)),
    db.select().from(cohorts),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    email,
    attempts,
    submissions,
    evaluations,
    judgeResults: judges,
    humanReviews: reviews, curriculumInstances: instances,
    modelBudgetLedgers: budgets,
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
    memberships: memberships.map(({ inviteToken: _token, ...member }) => { void _token; return member; }),
    enrollments, presence, interventions, liveRoomBoardCards: cards, account, sessions,
    cohortRoster: roster.filter((row) => (JSON.parse(row.learnerEmailsJson) as string[]).includes(email))
      .map((row) => ({ id: row.id, name: row.name, learnerEmail: email })),
  };
}

export { deleteLearnerData } from "./account-erasure";

/** Counts what a purge would remove, for the governance page to display. */
const retainedTables = { modelRuns, judgeResults, regressionRuns, liveRoomBoardCards, modelUsageEvents };

export async function retentionPreview(organizationId: string) {
  const policy = await activePolicyForOrganization(organizationId);
  if (policy.promptRetentionDays <= 0) {
    return { retentionDays: policy.promptRetentionDays, expiring: 0 };
  }
  const cutoff = cutoffIso(policy.promptRetentionDays);
  const counts = await Promise.all(Object.values(retainedTables).map(async (table) =>
    (await getDb().select({ id: table.id }).from(table).where(and(eq(table.organizationId, organizationId), lt(table.createdAt, cutoff)))).length));
  return { retentionDays: policy.promptRetentionDays, expiring: counts.reduce((sum, count) => sum + count, 0) };
}
