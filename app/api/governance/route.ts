import { desc, eq } from "../../../db/firestore-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { auditEvents, policyProfiles } from "../../../db/schema";
import { activePolicy, activePolicyForOrganization, defaultPolicy, providerIds, recordAudit, saveOrganizationPolicy, toPolicy, type Policy } from "../../lib/governance";
import { ensureFacilitatorOrganization } from "../../lib/cohort-operations";
import { serverErrorResponse } from "../../lib/observability";
import { hasFacilitatorAccess } from "../../lib/identity-trust";
import { boundedText, readJsonBody } from "../../lib/request-limits";
import { facilitatorRequiredResponse, getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";
import { purgeExpiredPromptData, retentionPreview } from "../../lib/retention";

const boundedRules = (value: unknown, fallback: string[]) =>
  Array.isArray(value) ? value.slice(0, 50).map((rule) => boundedText(rule, 500)) : fallback;

async function handleGet(request: Request) {
  await ensureLabSchema(); const identity = await getRequestIdentity(request); if (!identity) return unauthorizedResponse();
  if (!hasFacilitatorAccess(identity)) return Response.json({ policy: await activePolicy(identity.email) });
  const organization = await ensureFacilitatorOrganization(identity.email, identity.displayName);
  const policy = await activePolicyForOrganization(organization.id);
  const profiles = (await getDb().select().from(policyProfiles).where(eq(policyProfiles.organizationId, organization.id)).orderBy(desc(policyProfiles.version))).map(toPolicy);
  const audit = await getDb().select().from(auditEvents).where(eq(auditEvents.organizationId, organization.id)).orderBy(desc(auditEvents.createdAt)).limit(100);
  return Response.json({
    policy,
    profiles: profiles.length ? profiles : [defaultPolicy],
    audit,
    organizationId: organization.id,
    retention: await retentionPreview(organization.id),
  });
}

async function handlePost(request: Request) {
  await ensureLabSchema(); const identity = await getRequestIdentity(request); if (!identity) return unauthorizedResponse();
  if (!hasFacilitatorAccess(identity)) return facilitatorRequiredResponse();
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const organization = await ensureFacilitatorOrganization(identity.email, identity.displayName);
  if (body.organizationId !== undefined && body.organizationId !== organization.id) return Response.json({ error: "Organization access denied" }, { status: 403 });

  // Never run a global purge from an organization administrator's request.
  if (body.action === "purge-retention") {
    const result = await purgeExpiredPromptData(organization.id, identity.email);
    await recordAudit(identity.email, "policy.retention-purged", "policy-profile", (await activePolicyForOrganization(organization.id)).id, result.deleted, organization.id);
    return Response.json({ ...result, retention: await retentionPreview(organization.id) });
  }

  if (body.action !== "save" && body.action !== "activate") return Response.json({ error: "Unsupported action" }, { status: 400 });
  const allowedIntakeTier = String(body.allowedIntakeTier ?? "T1");
  const dataClasses = Array.isArray(body.dataClasses) ? body.dataClasses.map(String).filter((item) => ["Public", "Internal", "Confidential", "Regulated"].includes(item)) : [];
  const approvedModels = Array.isArray(body.approvedModels) ? body.approvedModels.map(String).filter((item) => providerIds.includes(item as never)) : [];
  if (!["T0", "T1", "T2"].includes(allowedIntakeTier) || !dataClasses.length || !approvedModels.length) return Response.json({ error: "Tier, at least one data class, and at least one provider are required" }, { status: 400 });
  const days = Number(body.promptRetentionDays ?? 90);
  if (!Number.isInteger(days) || days < 0 || days > 365) return Response.json({ error: "Retention must be an integer from 0 to 365 days" }, { status: 400 });
  const policy = await saveOrganizationPolicy(organization.id, identity.email, {
    ...defaultPolicy, name: boundedText(body.name || "Organization AI policy", 100).trim(),
    allowedIntakeTier: allowedIntakeTier as Policy["allowedIntakeTier"], dataClasses, approvedModels: approvedModels as Policy["approvedModels"],
    prohibitedUses: boundedRules(body.prohibitedUses, defaultPolicy.prohibitedUses),
    disclosureRules: boundedRules(body.disclosureRules, defaultPolicy.disclosureRules),
    humanReviewRules: boundedRules(body.humanReviewRules, defaultPolicy.humanReviewRules), promptRetentionDays: days,
  }, body.action === "activate");
  return Response.json({ policy }, { status: 201 });
}

export async function GET(request: Request) {
  try { return await handleGet(request); }
  catch (error) { return serverErrorResponse("governance", error, "Governance could not be loaded."); }
}

export async function POST(request: Request) {
  try { return await handlePost(request); }
  catch (error) { return serverErrorResponse("governance", error, "The governance operation could not be completed."); }
}
