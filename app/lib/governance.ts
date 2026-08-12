import { desc, eq } from "../../db/firestore-orm";
import { getDb } from "../../db";
import { auditEvents, policyProfiles } from "../../db/schema";
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

export async function activePolicy(): Promise<Policy> {
  const [row] = await getDb().select().from(policyProfiles).where(eq(policyProfiles.status, "active"))
    .orderBy(desc(policyProfiles.version)).limit(1);
  return row ? toPolicy(row) : defaultPolicy;
}

const tierRank: Record<IntakeTier, number> = { T0: 0, T1: 1, T2: 2 };
export const permitsIntakeTier = (policy: Policy, tier: IntakeTier) => tierRank[tier] <= tierRank[policy.allowedIntakeTier];
export const permitsProvider = (policy: Policy, provider: string) => policy.approvedModels.includes(provider as GovernedProvider);
export const permitsDataClass = (policy: Policy, dataClass: string) => policy.dataClasses.includes(dataClass);

export async function recordAudit(actorEmail: string, action: string, entityType: string, entityId: string, details: object = {}) {
  await getDb().insert(auditEvents).values({ id: crypto.randomUUID(), actorEmail, action, entityType, entityId, detailsJson: JSON.stringify(details) });
}
