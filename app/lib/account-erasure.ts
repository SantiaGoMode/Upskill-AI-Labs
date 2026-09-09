import { createHash } from "node:crypto";
import { getDb } from "../../db";
import { eq, type DocumentTransaction } from "../../db/firestore-orm";
import * as schema from "../../db/schema";
import { exportLearnerData, type PurgeCounts } from "./retention";

const jobs = schema.accountErasures.tableName;
const pages = schema.accountErasurePages.tableName;
const jobIdFor = (email: string) => createHash("sha256").update(email).digest("hex");
type Target = { table: string; id: string; label: string; roster?: boolean };
type Job = typeof schema.accountErasures.$inferSelect;
const leaseExpiry = () => new Date(Date.now() + 120_000).toISOString();
const emptyCounts = () => Object.fromEntries([
  "evaluations", "judgeResults", "humanReviews", "modelRuns", "appeals", "regressionRuns",
  "submissions", "attempts", "measurements", "baselines", "redactionExperiments", "workflowMaps",
  "curriculumInstances", "capabilityClaims", "lessonProgress", "modelUsageEvents", "liveRoomBoardCards",
  "memberships", "enrollments", "presence", "interventions", "cohortRoster", "sessions", "account", "modelBudgetLedgers",
].map((label) => [label, 0]));

export class ErasureBusyError extends Error {
  constructor() { super("Account erasure is already running. Retry shortly."); }
}

export async function erasurePending(email: string) {
  const [job] = await getDb().select().from(schema.accountErasures).where(eq(schema.accountErasures.id, jobIdFor(email)));
  return Boolean(job && job.status !== "complete");
}

/** Called only after sign-in has independently verified the account identity. */
export async function createErasureRecoverySession(email: string, expiresAt: string) {
  const id = jobIdFor(email);
  return getDb().transaction(async (tx) => {
    const job = await tx.get(jobs, id);
    const user = await tx.get(schema.localUsers.tableName, email);
    if (!job || job.status === "complete" || !user || user.status !== "active") throw new Error("Erasure recovery is unavailable. Sign in again.");
    const sessionId = `erasure-${id}`;
    tx.put(schema.localSessions.tableName, sessionId, { id: sessionId, userEmail: email, expiresAt, createdAt: new Date().toISOString() });
    return sessionId;
  });
}

/** Every mutation checks the lease inside the transaction to fence stale workers. */
async function ownedJob(tx: DocumentTransaction, id: string, lease: string): Promise<Job> {
  const job = await tx.get(jobs, id) as Job | undefined;
  if (!job || job.lease !== lease) throw new ErasureBusyError();
  return job;
}

/** Resume an interrupted manifest; caller session is deleted only at completion. */
export async function deleteLearnerData(email: string, callerSessionId = ""): Promise<PurgeCounts> {
  const db = getDb();
  const id = jobIdFor(email);
  const lease = crypto.randomUUID();
  let job = await db.transaction(async (tx) => {
    const previous = await tx.get(jobs, id) as Job | undefined;
    if (previous?.status === "complete" && !await tx.get(schema.localUsers.tableName, email)) return previous;
    if (previous && previous.status !== "complete" && previous.leaseUntil > new Date().toISOString()) throw new ErasureBusyError();
    const next: Job = previous && previous.status !== "complete"
      ? { ...previous, lease, leaseUntil: leaseExpiry() }
      : { id, status: "planning", generation: crypto.randomUUID(), lease, leaseUntil: leaseExpiry(), pageCount: 0, nextPage: 0, countsJson: JSON.stringify(emptyCounts()) };
    tx.put(jobs, id, next);
    return next;
  });
  if (job.status === "complete") return JSON.parse(job.countsJson) as PurgeCounts;
  try {
    if (job.status === "planning") {
      const data = await exportLearnerData(email);
      const targets: Target[] = [];
      const add = (label: string, table: string, rows: Array<{ id: string }>) => {
        targets.push(...rows.map((row) => ({ label, table, id: row.id })));
      };
      add("evaluations", schema.evalResults.tableName, data.evaluations);
      add("judgeResults", schema.judgeResults.tableName, data.judgeResults);
      add("humanReviews", schema.humanReviews.tableName, data.humanReviews);
      add("modelRuns", schema.modelRuns.tableName, data.modelRuns);
      add("appeals", schema.scoreAppeals.tableName, data.appeals);
      add("regressionRuns", schema.regressionRuns.tableName, data.regressionRuns);
      add("submissions", schema.labSubmissions.tableName, data.submissions);
      add("attempts", schema.labAttempts.tableName, data.attempts);
      add("measurements", schema.workflowMeasurements.tableName, data.workflowMeasurements);
      add("baselines", schema.workflowBaselines.tableName, data.workflowBaselines);
      add("redactionExperiments", schema.redactionExperiments.tableName, data.redactionExperiments);
      add("workflowMaps", schema.workflowMaps.tableName, data.workflowMaps);
      add("curriculumInstances", schema.curriculumInstances.tableName, data.curriculumInstances);
      add("capabilityClaims", schema.capabilityClaims.tableName, data.capabilityClaims);
      add("lessonProgress", schema.lessonProgress.tableName, data.lessonProgress);
      add("modelUsageEvents", schema.modelUsageEvents.tableName, data.modelUsageEvents);
      add("modelBudgetLedgers", schema.modelBudgetLedgers.tableName, data.modelBudgetLedgers);
      add("liveRoomBoardCards", schema.liveRoomBoardCards.tableName, data.liveRoomBoardCards);
      add("memberships", schema.organizationMembers.tableName, data.memberships);
      add("enrollments", schema.cohortEnrollments.tableName, data.enrollments);
      add("presence", schema.liveRoomParticipants.tableName, data.presence);
      add("interventions", schema.cohortInterventions.tableName, data.interventions);
      targets.push(...data.cohortRoster.map((row) => ({ label: "cohortRoster", table: schema.cohorts.tableName, id: row.id, roster: true })));
      const sessions = await db.select().from(schema.localSessions).where(eq(schema.localSessions.userEmail, email));
      add("sessions", schema.localSessions.tableName, sessions);
      // Fixed small pages bound transaction size and manifest document size.
      for (let start = 0; start < targets.length; start += 100) {
        const pageId = `${job.generation}-${start / 100}`;
        await db.transaction(async (tx) => {
          const current = await ownedJob(tx, id, lease);
          tx.put(pages, pageId, { id: pageId, jobId: id, targetsJson: JSON.stringify(targets.slice(start, start + 100)) });
          tx.put(jobs, id, { ...current, pageCount: Math.max(current.pageCount, start / 100 + 1), leaseUntil: leaseExpiry() });
        });
      }
      // A retried planning pass may discover fewer targets after other cleanup.
      const [planned] = await db.select().from(schema.accountErasures).where(eq(schema.accountErasures.id, id));
      for (let page = Math.ceil(targets.length / 100); page < planned.pageCount; page++) {
        await db.transaction(async (tx) => {
          await ownedJob(tx, id, lease);
          tx.remove(pages, `${job.generation}-${page}`);
        });
      }
      job = await db.transaction(async (tx) => {
        const current = await ownedJob(tx, id, lease);
        const next = { ...current, status: "deleting", pageCount: Math.ceil(targets.length / 100), leaseUntil: leaseExpiry() };
        tx.put(jobs, id, next);
        return next;
      });
    }
    while (job.nextPage < job.pageCount) {
      job = await db.transaction(async (tx) => {
        const current = await ownedJob(tx, id, lease);
        const pageId = `${current.generation}-${current.nextPage}`;
        const page = await tx.get(pages, pageId);
        if (!page) throw new Error("Erasure manifest page is missing.");
        const targets = JSON.parse(String(page.targetsJson)) as Target[];
        const rows = await Promise.all(targets.map((target) => tx.get(target.table, target.id)));
        const counts = JSON.parse(current.countsJson) as PurgeCounts;
        targets.forEach((target, index) => {
          // Preserve this request's signed session so retries remain authenticated.
          if (target.table === schema.localSessions.tableName && target.id === callerSessionId) return;
          const row = rows[index];
          if (!row) return;
          if (target.roster) {
            const emails = JSON.parse(String(row.learnerEmailsJson)) as string[];
            tx.put(target.table, target.id, { ...row, learnerEmailsJson: JSON.stringify(emails.filter((value) => value !== email)) });
          } else tx.remove(target.table, target.id);
          counts[target.label] = (counts[target.label] ?? 0) + 1;
        });
        const next = { ...current, nextPage: current.nextPage + 1, countsJson: JSON.stringify(counts), leaseUntil: leaseExpiry() };
        tx.remove(pages, pageId);
        tx.put(jobs, id, next);
        return next;
      });
    }
    // A retry may use a different session. Remove previously preserved sessions,
    // retaining only this caller and the single authenticated recovery session.
    const recoveryId = `erasure-${id}`;
    const remainingSessions = await db.select().from(schema.localSessions).where(eq(schema.localSessions.userEmail, email));
    for (const session of remainingSessions.filter((row) => row.id !== callerSessionId && row.id !== recoveryId)) {
      await db.transaction(async (tx) => {
        const current = await ownedJob(tx, id, lease);
        const row = await tx.get(schema.localSessions.tableName, session.id);
        const counts = JSON.parse(current.countsJson) as PurgeCounts;
        if (row) { tx.remove(schema.localSessions.tableName, session.id); counts.sessions = (counts.sessions ?? 0) + 1; }
        tx.put(jobs, id, { ...current, countsJson: JSON.stringify(counts), leaseUntil: leaseExpiry() });
      });
    }
    return await db.transaction(async (tx) => {
      const current = await ownedJob(tx, id, lease);
      const user = await tx.get(schema.localUsers.tableName, email);
      const session = callerSessionId ? await tx.get(schema.localSessions.tableName, callerSessionId) : undefined;
      const recovery = recoveryId !== callerSessionId ? await tx.get(schema.localSessions.tableName, recoveryId) : undefined;
      const counts = JSON.parse(current.countsJson) as PurgeCounts;
      counts.account = user ? 1 : 0;
      if (recovery?.userEmail === email) {
        tx.remove(schema.localSessions.tableName, recoveryId);
        counts.sessions = (counts.sessions ?? 0) + 1;
      }
      if (session?.userEmail === email) {
        tx.remove(schema.localSessions.tableName, callerSessionId);
        counts.sessions = (counts.sessions ?? 0) + 1;
      }
      tx.remove(schema.localUsers.tableName, email);
      tx.put(jobs, id, { ...current, status: "complete", lease: "", leaseUntil: "", countsJson: JSON.stringify(counts) });
      tx.put(schema.auditEvents.tableName, current.generation, {
        id: current.generation, actorEmail: email, action: "account.erased", entityType: "learner", entityId: email,
        detailsJson: JSON.stringify({ deletedRows: Object.values(counts).reduce((sum, count) => sum + count, 0) }), createdAt: new Date().toISOString(),
      });
      return counts;
    });
  } catch (error) {
    // An ordinary failure is immediately retryable. Process death uses lease expiry.
    await db.transaction(async (tx) => {
      const current = await tx.get(jobs, id);
      if (current?.lease === lease) tx.put(jobs, id, { ...current, leaseUntil: "" });
    }).catch(() => undefined);
    throw error;
  }
}
