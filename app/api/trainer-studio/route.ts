import { and, desc, eq, inArray } from "../../../db/firestore-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { cohorts, curriculumVersions, workflowMaps } from "../../../db/schema";
import { curriculumLabs } from "../../curriculum-data";
import { recordAudit } from "../../lib/governance";
import { hasFacilitatorAccess } from "../../lib/identity-trust";
import { boundedText, MAX_STORED_JSON_CHARS, readJsonBody } from "../../lib/request-limits";
import { facilitatorRequiredResponse, getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";
import type { WorkflowCandidate } from "../../lib/redaction";
import { selectInChunks } from "../../lib/sql-chunks";
import { facilitatorLearnerEmails } from "../../lib/tenancy";
import { ensureFacilitatorOrganization, inviteCohortLearners } from "../../lib/cohort-operations";

const parse = <T>(value: string, fallback: T) => { try { return JSON.parse(value) as T; } catch { return fallback; } };
const canonicalContent = () => ({ assessedSpine: [{ id: "lab-01", title: "Intake and structure", play: "EXTRACT-STRUCTURE" }, ...curriculumLabs.map(({ id, title, play }) => ({ id, title, play }))], skinGuidance: "Use cohort workflow priorities without changing assessed outcomes or guardrails." });
const versionView = (row: typeof curriculumVersions.$inferSelect) => ({ ...row, content: parse(row.contentJson, {}) });
const cohortView = (row: typeof cohorts.$inferSelect) => ({ ...row, learnerEmails: parse(row.learnerEmailsJson, []), workflowSummary: parse(row.workflowSummaryJson, {}) });

/**
 * What this facilitator's own learners have prioritised. Scoped to their cohorts:
 * an aggregate over every confirmed map in the database would describe another
 * organization's workforce.
 */
async function workflowSummary(facilitatorEmail: string) {
  const learners = await facilitatorLearnerEmails(facilitatorEmail);
  const maps = learners.length
    ? await selectInChunks(learners, (batch) => getDb().select().from(workflowMaps)
        .where(and(eq(workflowMaps.status, "confirmed"), inArray(workflowMaps.ownerEmail, batch))))
    : [];
  const counts = new Map<string, { id: string; name: string; count: number }>();
  maps.forEach((map) => {
    const workflows = parse<WorkflowCandidate[]>(map.workflowsJson, []);
    const priorities = new Set(parse<string[]>(map.priorityWorkflowIdsJson, []));
    workflows.filter((item) => priorities.has(item.id)).forEach((item) => {
      const current = counts.get(item.name) ?? { id: item.id, name: item.name, count: 0 };
      current.count += 1; counts.set(item.name, current);
    });
  });
  return { confirmedLearners: maps.length, priorities: [...counts.values()].sort((a, b) => b.count - a.count) };
}

export async function GET(request: Request) {
  await ensureLabSchema(); const identity = await getRequestIdentity(request); if (!identity) return unauthorizedResponse();
  if (!hasFacilitatorAccess(identity)) return facilitatorRequiredResponse();
  // Scoped to the caller: cohort rows carry another organization's learner
  // addresses, and its curriculum drafts are not this facilitator's to read.
  const versions = (await getDb().select().from(curriculumVersions)
    .where(eq(curriculumVersions.ownerEmail, identity.email)).orderBy(desc(curriculumVersions.createdAt))).map(versionView);
  const cohortRows = (await getDb().select().from(cohorts)
    .where(eq(cohorts.ownerEmail, identity.email)).orderBy(desc(cohorts.createdAt))).map(cohortView);
  return Response.json({ canonical: canonicalContent(), versions, cohorts: cohortRows, workflowSummary: await workflowSummary(identity.email) });
}

export async function POST(request: Request) {
  await ensureLabSchema(); const identity = await getRequestIdentity(request); if (!identity) return unauthorizedResponse();
  if (!hasFacilitatorAccess(identity)) return facilitatorRequiredResponse();
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body; const action = String(body.action ?? "");
  // Every curriculum row is addressed by id *and* owner, so one facilitator can
  // neither read nor advance another's pathway through the review gate.
  const ownedVersion = (versionId: string) =>
    and(eq(curriculumVersions.id, versionId), eq(curriculumVersions.ownerEmail, identity.email));
  if (action === "fork") {
    const parentId = body.parentId ? String(body.parentId) : null;
    let content = canonicalContent(); let version = 1;
    if (parentId) {
      const [parent] = await getDb().select().from(curriculumVersions).where(ownedVersion(parentId)).limit(1);
      if (!parent) return Response.json({ error: "Parent version not found" }, { status: 404 });
      content = parse(parent.contentJson, canonicalContent()); version = parent.version + 1;
    }
    const [row] = await getDb().insert(curriculumVersions).values({ id: crypto.randomUUID(), parentId, ownerEmail: identity.email, name: boundedText(body.name || "Program manager pathway fork", 120).trim(), version, contentJson: JSON.stringify(content) }).returning();
    await recordAudit(identity.email, "curriculum.forked", "curriculum-version", row.id, { parentId });
    return Response.json({ version: versionView(row) }, { status: 201 });
  }
  const id = String(body.id ?? "");
  const [version] = await getDb().select().from(curriculumVersions).where(ownedVersion(id)).limit(1);
  if (["edit", "submit-review", "approve", "publish"].includes(action) && !version) return Response.json({ error: "Curriculum version not found" }, { status: 404 });
  if (action === "edit") {
    if (version!.status !== "draft") return Response.json({ error: "Only draft versions can be edited" }, { status: 409 });
    const content = body.content && typeof body.content === "object" ? body.content : parse(version!.contentJson, {});
    const contentJson = JSON.stringify(content);
    if (contentJson.length > MAX_STORED_JSON_CHARS) return Response.json({ error: "The curriculum content is too large" }, { status: 413 });
    const [row] = await getDb().update(curriculumVersions).set({ contentJson, changeSummary: boundedText(body.changeSummary, 2000).trim(), updatedAt: new Date().toISOString() }).where(eq(curriculumVersions.id, id)).returning();
    return Response.json({ version: versionView(row) });
  }
  if (action === "submit-review") {
    if (version!.status !== "draft" || !version!.changeSummary.trim()) return Response.json({ error: "A draft with a change summary is required for review" }, { status: 409 });
    const [row] = await getDb().update(curriculumVersions).set({ status: "in_review", updatedAt: new Date().toISOString() }).where(eq(curriculumVersions.id, id)).returning();
    await recordAudit(identity.email, "curriculum.review-requested", "curriculum-version", id);
    return Response.json({ version: versionView(row) });
  }
  if (action === "approve") {
    if (version!.status !== "in_review") return Response.json({ error: "Only versions in review can be approved" }, { status: 409 });
    const [row] = await getDb().update(curriculumVersions).set({ status: "approved", reviewerEmail: identity.email, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(curriculumVersions.id, id)).returning();
    await recordAudit(identity.email, "curriculum.approved", "curriculum-version", id);
    return Response.json({ version: versionView(row) });
  }
  if (action === "publish") {
    if (version!.status !== "approved" || !version!.reviewerEmail) return Response.json({ error: "Human review and approval are required before publishing" }, { status: 409 });
    const [row] = await getDb().update(curriculumVersions).set({ status: "published", updatedAt: new Date().toISOString() }).where(eq(curriculumVersions.id, id)).returning();
    await recordAudit(identity.email, "curriculum.published", "curriculum-version", id, { reviewer: row.reviewerEmail });
    return Response.json({ version: versionView(row) });
  }
  if (action === "create-cohort") {
    const curriculumVersionId = String(body.curriculumVersionId ?? "");
    const [published] = await getDb().select().from(curriculumVersions).where(ownedVersion(curriculumVersionId)).limit(1);
    if (!published || published.status !== "published") return Response.json({ error: "Choose a published curriculum version" }, { status: 409 });
    // Bounded: each address becomes an invitation row and an enrollment row.
    const learnerEmails = Array.isArray(body.learnerEmails) ? [...new Set(body.learnerEmails.map((item) => String(item).trim().toLowerCase()).filter((item) => item.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item)))].slice(0, 200) : [];
    const summary = await workflowSummary(identity.email);
    const organization = await ensureFacilitatorOrganization(identity.email, identity.displayName);
    const [row] = await getDb().insert(cohorts).values({ id: crypto.randomUUID(), ownerEmail: identity.email, organizationId: organization.id, name: boundedText(body.name || "New cohort", 120).trim(), curriculumVersionId, learnerEmailsJson: JSON.stringify(learnerEmails), workflowSummaryJson: JSON.stringify(summary), status: "ready" }).returning();
    const invitations = await inviteCohortLearners(row.id, organization.id, learnerEmails);
    await recordAudit(identity.email, "cohort.created", "cohort", row.id, { learnerCount: learnerEmails.length, curriculumVersionId });
    return Response.json({ cohort: cohortView(row), invitations: invitations.map((item) => ({ ...item, joinPath: `/account?invite=${item.token}` })) }, { status: 201 });
  }
  return Response.json({ error: "Unsupported action" }, { status: 400 });
}
