import { desc, eq } from "../../db/firestore-orm";
import { getDb } from "../../db";
import { auditEvents, policyProfiles, organizationPolicyState } from "../../db/schema";
import { organizationIdsFor, recordOrganization } from "./organization-scope";
import type { IntakeTier } from "./redaction";

export const providerIds = ["gemini", "openai", "anthropic", "ollama"] as const;
export type GovernedProvider = typeof providerIds[number];

export type Policy = {
  id: string;
  name: string;
  version: number;
  status: string;
  allowedIntakeTier: IntakeTier;
  dataClasses: string[];
  approvedModels: GovernedProvider[];
  prohibitedUses: string[];
  disclosureRules: string[];
  humanReviewRules: string[];
  promptRetentionDays: number;
};

export const defaultPolicy: Policy = {
  id: "builtin-phase2-default",
  name: "Safe local default",
  version: 1,
  status: "active",
  allowedIntakeTier: "T1",
  dataClasses: ["Public", "Internal"],
  approvedModels: [...providerIds],
  prohibitedUses: ["Autonomous employment decisions", "Unreviewed legal or financial advice", "Uploading regulated data"],
  disclosureRules: ["Disclose material AI assistance in published artifacts"],
  humanReviewRules: ["A person owns scope, risk, funding, and promotion decisions"],
  promptRetentionDays: 90,
};

const parse = <T>(value: string, fallback: T) => { try { return JSON.parse(value) as T; } catch { return fallback; } };

export function toPolicy(row: typeof policyProfiles.$inferSelect): Policy {
  return {
    id: row.id, name: row.name, version: row.version, status: row.status,
    allowedIntakeTier: row.allowedIntakeTier as IntakeTier,
    dataClasses: parse(row.dataClassesJson, []), approvedModels: parse(row.approvedModelsJson, []),
    prohibitedUses: parse(row.prohibitedUsesJson, []), disclosureRules: parse(row.disclosureRulesJson, []),
    humanReviewRules: parse(row.humanReviewRulesJson, []), promptRetentionDays: row.promptRetentionDays,
  };
}

function policyRow(policy: Policy, organizationId: string | null, updatedBy: string) {
  const now = new Date().toISOString();
  return { id: policy.id, organizationId, name: policy.name, version: policy.version, status: policy.status,
    allowedIntakeTier: policy.allowedIntakeTier, dataClassesJson: JSON.stringify(policy.dataClasses),
    approvedModelsJson: JSON.stringify(policy.approvedModels), prohibitedUsesJson: JSON.stringify(policy.prohibitedUses),
    disclosureRulesJson: JSON.stringify(policy.disclosureRules), humanReviewRulesJson: JSON.stringify(policy.humanReviewRules),
    promptRetentionDays: policy.promptRetentionDays, updatedBy, createdAt: now, updatedAt: now };
}

/** Freeze the legacy global policy once; later tenant activations never change it. */
export async function activePolicyForOrganization(organizationId: string): Promise<Policy> {
  const db = getDb();
  const stateKey = `organization:${organizationId}`;
  const baselineId = "migration:legacy-policy-baseline";
  const [initialized] = await db.select().from(organizationPolicyState).where(eq(organizationPolicyState.id, stateKey));
  const legacy = initialized ? undefined : (await db.select().from(policyProfiles).where(eq(policyProfiles.status, "active"))
    .orderBy(desc(policyProfiles.version))).find((row) => !row.organizationId);
  return db.transaction(async (tx) => {
    const state = await tx.get(organizationPolicyState.tableName, stateKey);
    if (state) {
      const row = await tx.get(policyProfiles.tableName, String(state.activePolicyId));
      if (!row || row.organizationId !== organizationId) throw new Error("Invalid organization policy state");
      return toPolicy(row as typeof policyProfiles.$inferSelect);
    }
    const baseline = await tx.get(policyProfiles.tableName, baselineId);
    const seed = baseline ? toPolicy(baseline as typeof policyProfiles.$inferSelect) : legacy ? toPolicy(legacy) : defaultPolicy;
    const policy = { ...seed, id: crypto.randomUUID(), version: 1, status: "active" };
    if (!baseline) tx.put(policyProfiles.tableName, baselineId, policyRow({ ...seed, id: baselineId, status: "baseline" }, null, "migration"));
    tx.put(policyProfiles.tableName, policy.id, policyRow(policy, organizationId, "migration"));
    tx.put(organizationPolicyState.tableName, stateKey, { id: stateKey, activePolicyId: policy.id, version: 1 });
    return policy;
  });
}

export function intersectPolicies(policies: Policy[]): Policy {
  if (!policies.length) return defaultPolicy;
  return policies.slice(1).reduce((result, policy) => ({ ...result,
    id: `${result.id}+${policy.id}`, name: "Combined organization policy",
    allowedIntakeTier: tierRank[result.allowedIntakeTier] <= tierRank[policy.allowedIntakeTier] ? result.allowedIntakeTier : policy.allowedIntakeTier,
    dataClasses: result.dataClasses.filter((value) => policy.dataClasses.includes(value)),
    approvedModels: result.approvedModels.filter((value) => policy.approvedModels.includes(value)),
    prohibitedUses: [...new Set([...result.prohibitedUses, ...policy.prohibitedUses])],
    disclosureRules: [...new Set([...result.disclosureRules, ...policy.disclosureRules])],
    humanReviewRules: [...new Set([...result.humanReviewRules, ...policy.humanReviewRules])],
    promptRetentionDays: result.promptRetentionDays === 0 ? policy.promptRetentionDays : policy.promptRetentionDays === 0 ? result.promptRetentionDays : Math.min(result.promptRetentionDays, policy.promptRetentionDays),
  }), policies[0]);
}

export async function activePolicy(email: string): Promise<Policy> {
  return intersectPolicies(await Promise.all((await organizationIdsFor(email)).map(activePolicyForOrganization)));
}

export async function saveOrganizationPolicy(organizationId: string, actorEmail: string, policy: Policy, activate: boolean) {
  await activePolicyForOrganization(organizationId);
  const db = getDb(); const id = crypto.randomUUID(); const key = `organization:${organizationId}`;
  return db.transaction(async (tx) => {
    const state = await tx.get(organizationPolicyState.tableName, key);
    if (!state) throw new Error("Missing organization policy state");
    const previous = await tx.get(policyProfiles.tableName, String(state.activePolicyId));
    if (!previous || previous.organizationId !== organizationId) throw new Error("Invalid organization policy state");
    const saved = { ...policy, id, version: Number(state.version) + 1, status: activate ? "active" : "draft" };
    if (activate) tx.put(policyProfiles.tableName, String(previous.id), { ...previous, status: "retired", updatedAt: new Date().toISOString() });
    tx.put(policyProfiles.tableName, id, policyRow(saved, organizationId, actorEmail));
    tx.put(organizationPolicyState.tableName, key, { ...state, version: saved.version, activePolicyId: activate ? id : state.activePolicyId });
    const auditId = crypto.randomUUID();
    tx.put(auditEvents.tableName, auditId, { id: auditId, organizationId, actorEmail, action: `policy.${saved.status}`, entityType: "policy-profile", entityId: id, detailsJson: JSON.stringify({ version: saved.version }), createdAt: new Date().toISOString() });
    return saved;
  });
}

const tierRank: Record<IntakeTier, number> = { T0: 0, T1: 1, T2: 2 };
export const permitsIntakeTier = (policy: Policy, tier: IntakeTier) => tierRank[tier] <= tierRank[policy.allowedIntakeTier];
export const permitsProvider = (policy: Policy, provider: string) => policy.approvedModels.includes(provider as GovernedProvider);
export const permitsDataClass = (policy: Policy, dataClass: string) => policy.dataClasses.includes(dataClass);

export async function recordAudit(actorEmail: string, action: string, entityType: string, entityId: string, details: object = {}, organizationId?: string) {
  await getDb().insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: organizationId ?? await recordOrganization(actorEmail), actorEmail, action, entityType, entityId, detailsJson: JSON.stringify(details) });
}
