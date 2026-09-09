import { afterEach, expect, it, vi } from "vitest";
import { getDb } from "../../db";
import { and, eq } from "../../db/firestore-orm";
import { auditEvents, organizationMembers, organizations, organizationPolicyState, policyProfiles, regressionRuns, modelUsageEvents } from "../../db/schema";
import { activePolicy, activePolicyForOrganization, defaultPolicy, saveOrganizationPolicy } from "../../app/lib/governance";
import { ensureFacilitatorOrganization } from "../../app/lib/cohort-operations";
import { recordOrganization } from "../../app/lib/organization-scope";
import { purgeExpiredPromptData, retentionPreview } from "../../app/lib/retention";

const db = getDb();
const orgIds: string[] = [];
const looseIds: string[] = [];
async function organization() {
  const email = `governance-${crypto.randomUUID()}@example.com`;
  const row = await ensureFacilitatorOrganization(email, "Governance contract");
  orgIds.push(row.id);
  return row;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const id of orgIds.splice(0)) {
    for (const table of [auditEvents, organizationMembers, policyProfiles, regressionRuns, modelUsageEvents]) await db.delete(table).where(eq(table.organizationId, id));
    await db.delete(organizations).where(eq(organizations.id, id));
    await db.delete(organizationPolicyState).where(eq(organizationPolicyState.id, `organization:${id}`));
  }
  for (const id of looseIds.splice(0)) await db.delete(modelUsageEvents).where(eq(modelUsageEvents.id, id));
});

it("creates one organization and membership under concurrent initialization", async () => {
  const email = `governance-${crypto.randomUUID()}@example.com`;
  const rows = await Promise.all(Array.from({ length: 4 }, () => ensureFacilitatorOrganization(email, "Concurrent")));
  orgIds.push(rows[0].id);
  expect(new Set(rows.map((row) => row.id)).size).toBe(1);
  expect(await db.select().from(organizationMembers).where(eq(organizationMembers.email, email))).toHaveLength(1);
});

it("freezes the legacy baseline while organizations independently activate policies", async () => {
  const baselineId = "migration:legacy-policy-baseline";
  const prior = await db.transaction((tx) => tx.get(policyProfiles.tableName, baselineId));
  const legacyId = crypto.randomUUID();
  try {
    await db.delete(policyProfiles).where(eq(policyProfiles.id, baselineId));
    await db.insert(policyProfiles).values({ id: legacyId, name: "Legacy baseline", version: 999, status: "active", allowedIntakeTier: "T0", dataClassesJson: '["Public"]', approvedModelsJson: '["gemini"]', prohibitedUsesJson: '[]', disclosureRulesJson: '[]', humanReviewRulesJson: '[]', promptRetentionDays: 12, updatedBy: "legacy@example.com" });
    const a = await organization(); const b = await organization();
    expect(await activePolicyForOrganization(a.id)).toMatchObject({ allowedIntakeTier: "T0", promptRetentionDays: 12 });
    await saveOrganizationPolicy(a.id, a.ownerEmail, { ...defaultPolicy, approvedModels: ["openai"] }, true);
    await db.update(policyProfiles).set({ promptRetentionDays: 200 }).where(eq(policyProfiles.id, legacyId));
    expect(await activePolicyForOrganization(b.id)).toMatchObject({ allowedIntakeTier: "T0", promptRetentionDays: 12, approvedModels: ["gemini"] });
    expect((await activePolicyForOrganization(a.id)).approvedModels).toEqual(["openai"]);
    expect((await db.select().from(policyProfiles).where(eq(policyProfiles.id, legacyId)))[0].status).toBe("active");
  } finally {
    await db.transaction(async (tx) => {
      tx.remove(policyProfiles.tableName, legacyId);
      if (prior) tx.put(policyProfiles.tableName, baselineId, prior);
      else tx.remove(policyProfiles.tableName, baselineId);
    });
  }
});

it("intersects shared membership policies and leaves ambiguous provenance unscoped", async () => {
  const a = await organization(); const b = await organization();
  const email = `shared-${crypto.randomUUID()}@example.com`;
  for (const org of [a, b]) await db.insert(organizationMembers).values({ id: crypto.randomUUID(), organizationId: org.id, email, displayName: "Shared", role: "learner", status: "active" });
  await saveOrganizationPolicy(a.id, a.ownerEmail, { ...defaultPolicy, allowedIntakeTier: "T0", approvedModels: ["gemini"], promptRetentionDays: 7 }, true);
  await saveOrganizationPolicy(b.id, b.ownerEmail, { ...defaultPolicy, allowedIntakeTier: "T2", approvedModels: ["openai"], promptRetentionDays: 0 }, true);
  expect(await activePolicy(email)).toMatchObject({ allowedIntakeTier: "T0", approvedModels: [], promptRetentionDays: 7 });
  expect(await recordOrganization(email)).toBeNull();
  await db.update(organizationMembers).set({ status: "invited" }).where(and(eq(organizationMembers.organizationId, b.id), eq(organizationMembers.email, email)));
  expect(await recordOrganization(email)).toBe(a.id);
  expect((await activePolicy(email)).approvedModels).toEqual(["gemini"]);
});

it("serializes policy versions and keeps exactly one active profile", async () => {
  const org = await organization();
  await activePolicyForOrganization(org.id);
  const policies = await Promise.all(Array.from({ length: 4 }, (_, index) => saveOrganizationPolicy(org.id, org.ownerEmail, { ...defaultPolicy, name: `Version ${index}` }, true)));
  expect(policies.map((p) => p.version).sort()).toEqual([2, 3, 4, 5]);
  const active = await db.select().from(policyProfiles).where(and(eq(policyProfiles.organizationId, org.id), eq(policyProfiles.status, "active")));
  expect(active).toHaveLength(1);
  expect((await activePolicyForOrganization(org.id)).id).toBe(active[0].id);
  const draft = await saveOrganizationPolicy(org.id, org.ownerEmail, defaultPolicy, false);
  expect(draft).toMatchObject({ version: 6, status: "draft" });
  expect((await activePolicyForOrganization(org.id)).id).toBe(active[0].id);
});

it("rolls back activation and its audit event when a transaction fails", async () => {
  const org = await organization();
  const previous = await activePolicyForOrganization(org.id);
  const transaction = db.transaction.bind(db);
  vi.spyOn(db, "transaction").mockImplementation((work) => transaction((tx) => work({ ...tx, get: tx.get.bind(tx), remove: tx.remove.bind(tx), put: (table, id, row) => {
    tx.put(table, id, row);
    if (table === auditEvents.tableName) throw new Error("injected activation failure");
  } })));
  await expect(saveOrganizationPolicy(org.id, org.ownerEmail, defaultPolicy, true)).rejects.toThrow("injected activation failure");
  expect(await activePolicyForOrganization(org.id)).toEqual(previous);
  expect(await db.select().from(policyProfiles).where(eq(policyProfiles.organizationId, org.id))).toHaveLength(1);
  expect(await db.select().from(auditEvents).where(eq(auditEvents.organizationId, org.id))).toHaveLength(0);
});

it("purges only expired organization-owned data and previews multiple retained categories", async () => {
  const a = await organization(); const b = await organization();
  for (const org of [a, b]) await saveOrganizationPolicy(org.id, org.ownerEmail, { ...defaultPolicy, promptRetentionDays: 1 }, true);
  const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
  for (const organizationId of [a.id, b.id, null]) {
    const id = crypto.randomUUID(); if (!organizationId) looseIds.push(id);
    await db.insert(modelUsageEvents).values({ id, organizationId, ownerEmail: a.ownerEmail, purpose: "workbench", provider: "gemini", model: "mock", estimatedUsd: 0, totalTokens: 1, createdAt: old });
  }
  await db.insert(regressionRuns).values({ id: crypto.randomUUID(), organizationId: a.id, ownerEmail: a.ownerEmail, attemptId: "contract", setId: "contract", provider: "gemini", mode: "preview", prompt: "Synthetic test", resultJson: "{}", usageJson: "{}", costJson: "{}", createdAt: old });
  expect((await retentionPreview(a.id)).expiring).toBe(2);
  expect((await purgeExpiredPromptData(a.id, a.ownerEmail)).deleted).toMatchObject({ modelUsageEvents: 1, regressionRuns: 1 });
  expect((await retentionPreview(a.id)).expiring).toBe(0);
  expect(await db.select().from(modelUsageEvents).where(eq(modelUsageEvents.ownerEmail, a.ownerEmail))).toHaveLength(2);
  expect((await retentionPreview(b.id)).expiring).toBe(1);
});
