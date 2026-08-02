import { desc, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { auditEvents, policyProfiles } from "../../../db/schema";
import { activePolicy, defaultPolicy, providerIds, recordAudit, toPolicy } from "../../lib/governance";
import { facilitatorRequiredResponse, getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";

export async function GET(request: Request) {
  await ensureLabSchema(); const identity = getRequestIdentity(request); if (!identity) return unauthorizedResponse();
  const policy = await activePolicy();
  if (identity.role !== "facilitator") return Response.json({ policy });
  const profiles = (await getDb().select().from(policyProfiles).orderBy(desc(policyProfiles.version))).map(toPolicy);
  const audit = await getDb().select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(100);
  return Response.json({ policy, profiles: profiles.length ? profiles : [defaultPolicy], audit });
}

export async function POST(request: Request) {
  await ensureLabSchema(); const identity = getRequestIdentity(request); if (!identity) return unauthorizedResponse();
  if (identity.role !== "facilitator") return facilitatorRequiredResponse();
  const body = await request.json() as Record<string, unknown>;
  if (body.action !== "save" && body.action !== "activate") return Response.json({ error: "Unsupported action" }, { status: 400 });
  const allowedIntakeTier = String(body.allowedIntakeTier ?? "T1");
  const dataClasses = Array.isArray(body.dataClasses) ? body.dataClasses.map(String).filter((item) => ["Public", "Internal", "Confidential", "Regulated"].includes(item)) : [];
  const approvedModels = Array.isArray(body.approvedModels) ? body.approvedModels.map(String).filter((item) => providerIds.includes(item as never)) : [];
  if (!["T0", "T1", "T2"].includes(allowedIntakeTier) || !dataClasses.length || !approvedModels.length) return Response.json({ error: "Tier, at least one data class, and at least one provider are required" }, { status: 400 });
  const rows = await getDb().select().from(policyProfiles).orderBy(desc(policyProfiles.version)).limit(1);
  const id = crypto.randomUUID(); const status = body.action === "activate" ? "active" : "draft";
  if (status === "active") await getDb().update(policyProfiles).set({ status: "retired", updatedAt: new Date().toISOString() }).where(ne(policyProfiles.status, "retired"));
  const [row] = await getDb().insert(policyProfiles).values({
    id, name: String(body.name ?? "Organization AI policy").trim().slice(0, 100), version: (rows[0]?.version ?? 0) + 1, status,
    allowedIntakeTier, dataClassesJson: JSON.stringify(dataClasses), approvedModelsJson: JSON.stringify(approvedModels),
    prohibitedUsesJson: JSON.stringify(Array.isArray(body.prohibitedUses) ? body.prohibitedUses.map(String) : defaultPolicy.prohibitedUses),
    disclosureRulesJson: JSON.stringify(Array.isArray(body.disclosureRules) ? body.disclosureRules.map(String) : defaultPolicy.disclosureRules),
    humanReviewRulesJson: JSON.stringify(Array.isArray(body.humanReviewRules) ? body.humanReviewRules.map(String) : defaultPolicy.humanReviewRules),
    promptRetentionDays: Math.max(0, Math.min(365, Number(body.promptRetentionDays ?? 90))), updatedBy: identity.email,
  }).returning();
  await recordAudit(identity.email, `policy.${status}`, "policy-profile", id, { version: row.version });
  return Response.json({ policy: toPolicy(row) }, { status: 201 });
}
