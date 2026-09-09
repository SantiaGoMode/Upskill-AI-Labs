import { and, eq } from "../../../../db/firestore-orm";
import { getDb } from "../../../../db";
import { ensureLabSchema } from "../../../../db/runtime";
import {
  capabilityClaims,
  cohortEnrollments,
  cohortSessions,
  cohorts,
  curriculumVersions,
  evalResults,
  labAttempts,
  labSubmissions,
  workflowBaselines,
  workflowMeasurements,
} from "../../../../db/schema";
import { curriculumLabs } from "../../../curriculum-data";
import { ensureFacilitatorOrganization, inviteCohortLearners } from "../../../lib/cohort-operations";
import { hasFacilitatorAccess } from "../../../lib/identity-trust";
import { recordAudit } from "../../../lib/governance";
import { getRequestIdentity, isLocalRequest, unauthorizedResponse, facilitatorRequiredResponse } from "../../../lib/request-identity";
import { isManagedEnvironment } from "../../../lib/runtime-env";
import type { DeterministicEvalResult, RubricBand } from "../../../lib/attempt-types";

/**
 * Local-only convenience: the in-memory store resets on every dev-server
 * restart, so `npm run seed:local` re-populates a cohort, sessions, and
 * capability ledger for the local-developer facilitator account. Never
 * reachable outside a local, unmanaged checkout.
 */
const SEED_COHORT_NAME = "AI-first Program Management · Local seed";
const LEARNER_EMAILS = ["amina.hassan@example.com", "diego.ramos@example.com"];
const SEED_LAB_IDS = ["lab-01", "lab-02", "lab-03", "lab-04"];

const dimensionResult = (band: RubricBand) => ({ band, evidence: ["seed-evidence"], nextStep: "Review with a facilitator." });
const seededEval = (band: RubricBand): DeterministicEvalResult => ({
  version: "seed-1",
  passed: true,
  completedFields: 6,
  dimensions: {
    grounding: dimensionResult(band),
    completeness: dimensionResult(band),
    judgment: dimensionResult(band),
    efficiency: dimensionResult(band),
    guardrails: dimensionResult(band),
  },
  summary: "Seeded locally for demo purposes.",
});

async function seedLabHistory(ownerEmail: string, labIds: string[], band: RubricBand, daysAgoStart: number) {
  const db = getDb();
  for (const [index, labId] of labIds.entries()) {
    const submittedAt = new Date(Date.now() - (daysAgoStart - index * 3) * 86_400_000).toISOString();
    const [attempt] = await db.insert(labAttempts).values({
      id: crypto.randomUUID(), ownerEmail, labId, status: "submitted",
      draftJson: "{}", prompt: "Seeded locally for demo purposes.", selectedSourcesJson: "[]",
      verification: "Seeded verification note.", secondsRemaining: 0,
      createdAt: submittedAt, updatedAt: submittedAt,
    }).returning();
    const [submission] = await db.insert(labSubmissions).values({
      id: crypto.randomUUID(), attemptId: attempt.id, payloadJson: "{}", submittedAt,
    }).returning();
    await db.insert(evalResults).values({
      id: crypto.randomUUID(), submissionId: submission.id, evaluatorVersion: "seed-1",
      resultJson: JSON.stringify(seededEval(band)), passed: true, createdAt: submittedAt,
    });
  }
}

export async function POST(request: Request) {
  if (!isLocalRequest(request) || isManagedEnvironment()) return Response.json({ error: "Not found" }, { status: 404 });
  const identity = await getRequestIdentity(request);
  if (!identity) return unauthorizedResponse();
  if (!hasFacilitatorAccess(identity)) return facilitatorRequiredResponse();
  await ensureLabSchema();
  const db = getDb();

  const [existing] = await db.select().from(cohorts).where(and(eq(cohorts.ownerEmail, identity.email), eq(cohorts.name, SEED_COHORT_NAME))).limit(1);
  if (existing) return Response.json({ status: "already-seeded", cohortId: existing.id });

  const organization = await ensureFacilitatorOrganization(identity.email, identity.displayName);
  const now = new Date().toISOString();
  const [version] = await db.insert(curriculumVersions).values({
    id: crypto.randomUUID(), parentId: null, ownerEmail: identity.email,
    name: "AI-first program management (local seed)", version: 1, status: "published",
    contentJson: JSON.stringify({ assessedSpine: curriculumLabs.map(({ id, title, play }) => ({ id, title, play })) }),
    changeSummary: "Seeded locally for demo purposes.", reviewerEmail: identity.email, reviewedAt: now,
  }).returning();

  const [cohort] = await db.insert(cohorts).values({
    id: crypto.randomUUID(), ownerEmail: identity.email, organizationId: organization.id,
    name: SEED_COHORT_NAME, curriculumVersionId: version.id,
    learnerEmailsJson: JSON.stringify(LEARNER_EMAILS), workflowSummaryJson: "{}",
    status: "active", startsAt: new Date(Date.now() - 21 * 86_400_000).toISOString(),
  }).returning();

  await inviteCohortLearners(cohort.id, organization.id, LEARNER_EMAILS);
  for (const learnerEmail of LEARNER_EMAILS) {
    await db.update(cohortEnrollments).set({ status: "active", currentLabId: "lab-05", joinedAt: now })
      .where(and(eq(cohortEnrollments.cohortId, cohort.id), eq(cohortEnrollments.learnerEmail, learnerEmail)));
    await seedLabHistory(learnerEmail, SEED_LAB_IDS, "Capable", 30);
  }

  const sessions = await Promise.all([
    { title: "Lab 6 coaching studio", offsetDays: 1, durationMinutes: 60, agenda: "Review the status jig input contract and regression failures." },
    { title: "Executive narrative critique", offsetDays: 8, durationMinutes: 60, agenda: "Audit claims and escalation thresholds before Lab 7." },
    { title: "Workflow promotion review", offsetDays: 15, durationMinutes: 75, agenda: "Review regression evidence and make the capstone promotion decision." },
  ].map(({ title, offsetDays, durationMinutes, agenda }) =>
    db.insert(cohortSessions).values({
      id: crypto.randomUUID(), cohortId: cohort.id, title,
      scheduledAt: new Date(Date.now() + offsetDays * 86_400_000).toISOString(),
      durationMinutes, agenda, status: "scheduled", createdBy: identity.email,
    }).returning().then(([row]) => row)));

  await seedLabHistory(identity.email, SEED_LAB_IDS, "Strong", 40);
  const claimBands: Array<[string, string, RubricBand]> = [
    ["EXTRACT-STRUCTURE", "extract structure", "Strong"],
    ["DRAFT-FROM-EVIDENCE", "evidence linked status", "Capable"],
    ["SYNTHESIZE-MANY", "risk synthesis", "Strong"],
  ];
  const claims = await Promise.all(claimBands.map(([key, label, band]) => {
    const earnedAt = new Date(Date.now() - 30 * 86_400_000).toISOString();
    return db.insert(capabilityClaims).values({
      id: crypto.randomUUID(), ownerEmail: identity.email, capabilityKey: key, label, band, status: "active",
      evidenceJson: JSON.stringify([{ labId: SEED_LAB_IDS[0], submittedAt: earnedAt, note: "Seeded locally for demo purposes." }]),
      earnedAt, expiresAt: new Date(Date.parse(earnedAt) + 180 * 86_400_000).toISOString(), updatedAt: earnedAt,
    }).returning().then(([row]) => row);
  }));

  const [baseline] = await db.insert(workflowBaselines).values({
    id: crypto.randomUUID(), ownerEmail: identity.email, workflowId: "workflow-seed",
    workflowName: "Draft evidence-linked program status", metricName: "Minutes from reporting-window close to reviewed draft",
    unit: "minutes", baselineValue: "135", targetValue: "75", notes: "Seeded locally for demo purposes.",
    measuredAt: new Date(Date.now() - 45 * 86_400_000).toISOString(),
  }).returning();
  const [measurement] = await db.insert(workflowMeasurements).values({
    id: crypto.randomUUID(), baselineId: baseline.id, ownerEmail: identity.email, value: "88", sourceType: "self_attested",
    reflection: "Seeded locally for demo purposes: the evidence checklist removed a reconciliation pass.",
    measuredAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  }).returning();

  await recordAudit(identity.email, "dev.seed", "cohort", cohort.id, { learnerCount: LEARNER_EMAILS.length, sessionCount: sessions.length });
  return Response.json({ status: "seeded", cohortId: cohort.id, sessions: sessions.length, claims: claims.length, baseline: baseline.id, measurement: measurement.id }, { status: 201 });
}
