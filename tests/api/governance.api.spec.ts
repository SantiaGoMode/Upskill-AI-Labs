import { expect, test } from "@playwright/test";

test("policy activation, history, audit, and provider restrictions stay organization-scoped", async ({ request }) => {
  const facilitator = (email: string) => ({ "oai-authenticated-user-email": email, "oai-authenticated-user-role": "facilitator" });
  const a = facilitator(`policy-a-${crypto.randomUUID()}@example.com`);
  const b = facilitator(`policy-b-${crypto.randomUUID()}@example.com`);
  const beforeA = await (await request.get("/api/governance", { headers: a })).json();
  const beforeB = await (await request.get("/api/governance", { headers: b })).json();
  expect(beforeA.organizationId).not.toBe(beforeB.organizationId);
  const data = { action: "activate", name: "A only", allowedIntakeTier: "T0", dataClasses: ["Public"], approvedModels: ["ollama"], promptRetentionDays: 7 };
  const activated = await request.post("/api/governance", { headers: a, data });
  expect(activated.status()).toBe(201);
  const policy = (await activated.json()).policy;
  const afterA = await (await request.get("/api/governance", { headers: a })).json();
  const afterB = await (await request.get("/api/governance", { headers: b })).json();
  expect(afterA.policy.id).toBe(policy.id);
  expect(afterA.audit.some((row: { entityId: string }) => row.entityId === policy.id)).toBe(true);
  expect(afterB.policy).toEqual(beforeB.policy);
  expect(afterB.profiles.some((row: { id: string }) => row.id === policy.id)).toBe(false);
  expect(afterB.audit.some((row: { entityId: string }) => row.entityId === policy.id)).toBe(false);
  const denied = await request.post("/api/governance", { headers: a, data: { ...data, organizationId: beforeB.organizationId } });
  expect(denied.status()).toBe(403);
  const deniedPurge = await request.post("/api/governance", { headers: a, data: { action: "purge-retention", organizationId: beforeB.organizationId } });
  expect(deniedPurge.status()).toBe(403);
  const onboarding = await request.get("/api/onboarding", { headers: a });
  expect((await onboarding.json()).policy.allowedIntakeTier).toBe("T0");
  const configuration = await (await request.get("/api/model-runs?config=providers", { headers: a })).json();
  expect(configuration.providers.filter((row: { allowed: boolean }) => row.allowed).map((row: { provider: string }) => row.provider)).toEqual(["ollama"]);
  const started = await request.post("/api/attempts", { headers: a, data: { action: "start", labId: "lab-01" } });
  const { attempt } = await started.json();
  const blockedRun = await request.post("/api/model-runs", { headers: a, data: { attemptId: attempt.id, provider: "gemini", prompt: "Synthetic test", selectedSources: ["NW-ROADMAP-03"] } });
  expect(blockedRun.status()).toBe(403);
  expect((await blockedRun.json()).error).toContain("not approved");
  for (const promptRetentionDays of ["invalid", -1, 366, 1.5]) {
    expect((await request.post("/api/governance", { headers: a, data: { ...data, promptRetentionDays } })).status()).toBe(400);
  }
  expect((await (await request.get("/api/governance", { headers: a })).json()).policy.id).toBe(policy.id);
});
