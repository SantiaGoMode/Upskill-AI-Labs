import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { cohortEnrollments, cohortInterventions, cohorts, cohortSessions, curriculumVersions, evalResults, labAttempts, labSubmissions, organizations } from "../../../db/schema";
import { ensureFacilitatorOrganization, inviteCohortLearners } from "../../lib/cohort-operations";
import { recordAudit } from "../../lib/governance";
import { byText, byTextDesc, selectInChunks } from "../../lib/sql-chunks";
import { readJsonBody } from "../../lib/request-limits";
import { facilitatorRequiredResponse, getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";

const parse = <T>(value: string, fallback: T) => { try { return JSON.parse(value) as T; } catch { return fallback; } };

async function learnerProgress(emails: string[]) {
  if (!emails.length) return new Map<string, { completedLabs: string[]; passedLabs: string[]; lastActivity: string | null }>();
  const db = getDb();
  const attempts = await selectInChunks(emails, (batch) =>
    db.select().from(labAttempts).where(inArray(labAttempts.ownerEmail, batch)));
  const submissions = await selectInChunks(emails, (batch) =>
    db.select({ ownerEmail: labAttempts.ownerEmail, labId: labAttempts.labId, passed: evalResults.passed })
      .from(labSubmissions).innerJoin(labAttempts, eq(labAttempts.id, labSubmissions.attemptId)).innerJoin(evalResults, eq(evalResults.submissionId, labSubmissions.id))
      .where(inArray(labAttempts.ownerEmail, batch)));
  return new Map(emails.map((email) => {
    const owned = attempts.filter((attempt) => attempt.ownerEmail === email);
    return [email, {
      completedLabs: [...new Set(owned.filter((attempt) => attempt.status === "submitted").map((attempt) => attempt.labId))],
      passedLabs: [...new Set(submissions.filter((item) => item.ownerEmail === email && item.passed).map((item) => item.labId))],
      lastActivity: owned.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.updatedAt ?? null,
    }];
  }));
}

async function buildCohortViews(rows: Array<typeof cohorts.$inferSelect>) {
  if (!rows.length) return [];
  const db = getDb(); const ids = rows.map((row) => row.id);
  // Chunked: a facilitator accumulates cohorts over time, and one `inArray` over
  // every id exceeds D1's bound-parameter limit. Ordering is reapplied after the
  // chunks are concatenated, since each query only orders its own batch.
  const enrollments = await selectInChunks(ids, (batch) =>
    db.select().from(cohortEnrollments).where(inArray(cohortEnrollments.cohortId, batch)));
  const sessions = (await selectInChunks(ids, (batch) =>
    db.select().from(cohortSessions).where(inArray(cohortSessions.cohortId, batch))))
    .sort(byText((session) => session.scheduledAt));
  const interventions = (await selectInChunks(ids, (batch) =>
    db.select().from(cohortInterventions).where(inArray(cohortInterventions.cohortId, batch))))
    .sort(byTextDesc((note) => note.createdAt));
  const progress = await learnerProgress([...new Set(enrollments.map((item) => item.learnerEmail))]);
  const versions = await selectInChunks([...new Set(rows.map((row) => row.curriculumVersionId))], (batch) =>
    db.select().from(curriculumVersions).where(inArray(curriculumVersions.id, batch)));
  return rows.map((cohort) => {
    const learnerRows = enrollments.filter((item) => item.cohortId === cohort.id).map((enrollment) => {
      const item = progress.get(enrollment.learnerEmail) ?? { completedLabs: [], passedLabs: [], lastActivity: null };
      return { ...enrollment, ...item, completionPercent: Math.round(item.completedLabs.length / 8 * 100), interventions: interventions.filter((note) => note.cohortId === cohort.id && note.learnerEmail === enrollment.learnerEmail) };
    });
    return {
      ...cohort,
      learnerEmails: parse<string[]>(cohort.learnerEmailsJson, []), workflowSummary: parse(cohort.workflowSummaryJson, {}),
      curriculum: versions.find((version) => version.id === cohort.curriculumVersionId) ?? null,
      learners: learnerRows, sessions: sessions.filter((session) => session.cohortId === cohort.id),
      outcome: { invited: learnerRows.length, enrolled: learnerRows.filter((item) => item.status !== "invited").length, completed: learnerRows.filter((item) => item.completedLabs.length === 8).length, passedLabs: learnerRows.reduce((sum, item) => sum + item.passedLabs.length, 0), totalSubmissions: learnerRows.reduce((sum, item) => sum + item.completedLabs.length, 0) },
    };
  });
}

export async function GET(request: Request) {
  await ensureLabSchema(); const identity = await getRequestIdentity(request); if (!identity) return unauthorizedResponse();
  const db = getDb();
  if (identity.role === "facilitator") {
    const organization = await ensureFacilitatorOrganization(identity.email, identity.displayName);
    const rows = await db.select().from(cohorts).where(eq(cohorts.ownerEmail, identity.email)).orderBy(desc(cohorts.createdAt));
    return Response.json({ identity, organization, cohorts: await buildCohortViews(rows) });
  }
  const enrollments = await db.select().from(cohortEnrollments).where(eq(cohortEnrollments.learnerEmail, identity.email));
  const rows = await selectInChunks(enrollments.map((item) => item.cohortId), (batch) =>
    db.select().from(cohorts).where(inArray(cohorts.id, batch)));
  const views = await buildCohortViews(rows);
  return Response.json({ identity, cohorts: views.map((cohort) => ({
    id: cohort.id,
    name: cohort.name,
    status: cohort.status,
    startsAt: cohort.startsAt,
    endsAt: cohort.endsAt,
    curriculum: cohort.curriculum ? { id: cohort.curriculum.id, name: cohort.curriculum.name, version: cohort.curriculum.version, status: cohort.curriculum.status } : null,
    learners: cohort.learners.filter((learner) => learner.learnerEmail === identity.email),
    sessions: cohort.sessions,
  })) });
}

export async function POST(request: Request) {
  await ensureLabSchema(); const identity = await getRequestIdentity(request); if (!identity) return unauthorizedResponse();
  if (identity.role !== "facilitator") return facilitatorRequiredResponse();
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body; const action = String(body.action ?? ""); const db = getDb();
  const organization = await ensureFacilitatorOrganization(identity.email, identity.displayName);
  if (action === "rename-organization") {
    const name = String(body.name ?? "").trim(); if (name.length < 3) return Response.json({ error: "Organization name is required" }, { status: 400 });
    const [row] = await db.update(organizations).set({ name: name.slice(0, 100) }).where(and(eq(organizations.id, organization.id), eq(organizations.ownerEmail, identity.email))).returning();
    return Response.json({ organization: row });
  }
  const cohortId = String(body.cohortId ?? "");
  const [cohort] = await db.select().from(cohorts).where(and(eq(cohorts.id, cohortId), eq(cohorts.ownerEmail, identity.email))).limit(1);
  if (!cohort) return Response.json({ error: "Cohort not found" }, { status: 404 });
  if (action === "invite") {
    const emails = Array.isArray(body.emails) ? body.emails.map(String) : [];
    const invitations = await inviteCohortLearners(cohort.id, organization.id, emails);
    await recordAudit(identity.email, "cohort.learners-invited", "cohort", cohort.id, { count: invitations.length });
    return Response.json({ invitations: invitations.map((item) => ({ ...item, joinPath: `/account?invite=${item.token}` })) }, { status: 201 });
  }
  if (action === "schedule-session") {
    const title = String(body.title ?? "").trim(); const scheduledAt = String(body.scheduledAt ?? ""); const durationMinutes = Number(body.durationMinutes ?? 60);
    if (!title || Number.isNaN(new Date(scheduledAt).getTime()) || !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) return Response.json({ error: "A title, valid date, and duration from 15 to 480 minutes are required" }, { status: 400 });
    const [session] = await db.insert(cohortSessions).values({ id: crypto.randomUUID(), cohortId, title: title.slice(0, 120), scheduledAt: new Date(scheduledAt).toISOString(), durationMinutes, agenda: String(body.agenda ?? "").slice(0, 3000), createdBy: identity.email }).returning();
    await recordAudit(identity.email, "cohort.session-scheduled", "cohort", cohortId, { sessionId: session.id });
    return Response.json({ session }, { status: 201 });
  }
  if (action === "add-intervention") {
    const learnerEmail = String(body.learnerEmail ?? "").trim().toLowerCase(); const note = String(body.note ?? "").trim();
    const [enrollment] = await db.select().from(cohortEnrollments).where(and(eq(cohortEnrollments.cohortId, cohortId), eq(cohortEnrollments.learnerEmail, learnerEmail))).limit(1);
    if (!enrollment || note.length < 5) return Response.json({ error: "An enrolled learner and intervention note are required" }, { status: 400 });
    const [intervention] = await db.insert(cohortInterventions).values({ id: crypto.randomUUID(), cohortId, learnerEmail, facilitatorEmail: identity.email, note: note.slice(0, 2000) }).returning();
    return Response.json({ intervention }, { status: 201 });
  }
  if (action === "resolve-intervention") {
    const id = String(body.interventionId ?? "");
    const [intervention] = await db.update(cohortInterventions).set({ status: "resolved", resolvedAt: new Date().toISOString() }).where(and(eq(cohortInterventions.id, id), eq(cohortInterventions.cohortId, cohortId))).returning();
    if (!intervention) return Response.json({ error: "Intervention not found" }, { status: 404 });
    return Response.json({ intervention });
  }
  if (action === "update-status") {
    const status = String(body.status ?? ""); if (!["ready", "active", "completed", "archived"].includes(status)) return Response.json({ error: "Invalid cohort status" }, { status: 400 });
    const now = new Date().toISOString();
    const [row] = await db.update(cohorts).set({ status, startsAt: status === "active" ? cohort.startsAt ?? now : cohort.startsAt, endsAt: status === "completed" ? now : cohort.endsAt, archivedAt: status === "archived" ? now : cohort.archivedAt }).where(eq(cohorts.id, cohortId)).returning();
    await recordAudit(identity.email, `cohort.${status}`, "cohort", cohortId);
    return Response.json({ cohort: row });
  }
  return Response.json({ error: "Unsupported action" }, { status: 400 });
}
