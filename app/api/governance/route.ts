import { desc, inArray, ne } from "../../../db/firestore-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { auditEvents, policyProfiles } from "../../../db/schema";
import { activePolicy, defaultPolicy, providerIds, recordAudit, toPolicy } from "../../lib/governance";
import { hasFacilitatorAccess } from "../../lib/identity-trust";
import { boundedText, readJsonBody } from "../../lib/request-limits";
import { facilitatorRequiredResponse, getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";
import { purgeExpiredPromptData, retentionPreview } from "../../lib/retention";
import { selectInChunks } from "../../lib/sql-chunks";
import { facilitatorLearnerEmails } from "../../lib/tenancy";

const boundedRules = (value: unknown, fallback: string[]) =>
  Array.isArray(value) ? value.slice(0, 50).map((rule) => boundedText(rule, 500)) : fallback;

export async function GET(request: Request) {
  await ensureLabSchema(); const identity = await getRequestIdentity(request); if (!identity) return unauthorizedResponse();
  const policy = await activePolicy();
  if (!hasFacilitatorAccess(identity)) return Response.json({ policy });
  const profiles = (await getDb().select().from(policyProfiles).orderBy(desc(policyProfiles.version))).map(toPolicy);
  // The trail is scoped to this facilitator and the learners they are
  // responsible for. Read unscoped it names another organization's people and
  // what they did, which is not this facilitator's record to hold.
  const visibleActors = [identity.email, ...await facilitatorLearnerEmails(identity.email)];
  const audit = (await selectInChunks(visibleActors, (batch) =>
    getDb().select().from(auditEvents).where(inArray(auditEvents.actorEmail, batch))
      .orderBy(desc(auditEvents.createdAt)).limit(100)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
  return Response.json({
    policy,
    profiles: profiles.length ? profiles : [defaultPolicy],
    audit,
    retention: await retentionPreview(),
  });
}

export async function POST(request: Request) {
  await ensureLabSchema(); const identity = await getRequestIdentity(request); if (!identity) return unauthorizedResponse();
  if (!hasFacilitatorAccess(identity)) return facilitatorRequiredResponse();
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  // The nightly cron does this on a schedule; this runs it on demand.
  if (body.action === "purge-retention") {
    const result = await purgeExpiredPromptData();
    await recordAudit(identity.email, "policy.retention-purged", "policy-profile", (await activePolicy()).id, result.deleted);
    return Response.json({ ...result, retention: await retentionPreview() });
  }

  if (body.action !== "save" && body.action !== "activate") return Response.json({ error: "Unsupported action" }, { status: 400 });
  const allowedIntakeTier = String(body.allowedIntakeTier ?? "T1");
  const dataClasses = Array.isArray(body.dataClasses) ? body.dataClasses.map(String).filter((item) => ["Public", "Internal", "Confidential", "Regulated"].includes(item)) : [];
  const approvedModels = Array.isArray(body.approvedModels) ? body.approvedModels.map(String).filter((item) => providerIds.includes(item as never)) : [];
  if (!["T0", "T1", "T2"].includes(allowedIntakeTier) || !dataClasses.length || !approvedModels.length) return Response.json({ error: "Tier, at least one data class, and at least one provider are required" }, { status: 400 });
  const rows = await getDb().select().from(policyProfiles).orderBy(desc(policyProfiles.version)).limit(1);
  const id = crypto.randomUUID(); const status = body.action === "activate" ? "active" : "draft";
  if (status === "active") await getDb().update(policyProfiles).set({ status: "retired", updatedAt: new Date().toISOString() }).where(ne(policyProfiles.status, "retired"));
  const [row] = await getDb().insert(policyProfiles).values({
    id, name: boundedText(body.name || "Organization AI policy", 100).trim(), version: (rows[0]?.version ?? 0) + 1, status,
    allowedIntakeTier, dataClassesJson: JSON.stringify(dataClasses), approvedModelsJson: JSON.stringify(approvedModels),
    // Rule lists are free text shown back to every learner, so they are bounded
    // in both count and length rather than stored as the client sent them.
    prohibitedUsesJson: JSON.stringify(boundedRules(body.prohibitedUses, defaultPolicy.prohibitedUses)),
    disclosureRulesJson: JSON.stringify(boundedRules(body.disclosureRules, defaultPolicy.disclosureRules)),
    humanReviewRulesJson: JSON.stringify(boundedRules(body.humanReviewRules, defaultPolicy.humanReviewRules)),
    promptRetentionDays: Math.max(0, Math.min(365, Number(body.promptRetentionDays ?? 90))), updatedBy: identity.email,
  }).returning();
  await recordAudit(identity.email, `policy.${status}`, "policy-profile", id, { version: row.version });
  return Response.json({ policy: toPolicy(row) }, { status: 201 });
}
