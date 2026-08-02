import { expect, test } from "@playwright/test";

const learner = { "oai-authenticated-user-email": "phase2-learner@example.com" };

test("T1 onboarding stores only shapes and creates a fixed-spine pathway", async ({ request }) => {
  const rejected = await request.post("/api/onboarding", { headers: learner, data: { action: "propose", intakeTier: "T1", roleDescription: "Program manager responsible for delivery governance", artifactText: "secret@example.com" } });
  expect(rejected.status()).toBe(400);

  const proposed = await request.post("/api/onboarding", { headers: learner, data: {
    action: "propose", intakeTier: "T1", roleDescription: "Program manager responsible for delivery governance", industry: "Technology", seniority: "Senior",
    artifactShapes: [{ name: "status.md", extension: "md", lengthBucket: "short", characters: 120, lines: 10, paragraphs: 3, headings: 1, listItems: 4, tableRows: 0, tableColumns: 0, formFields: 2, markers: { dates: 1, emails: 1, phones: 0, currency: 0 } }],
  } });
  expect(proposed.status()).toBe(201);
  const map = (await proposed.json()).workflowMap;
  expect(map.workflows).toHaveLength(9);
  expect(JSON.stringify(map)).not.toContain("secret@example.com");

  const confirmed = await request.post("/api/onboarding", { headers: learner, data: { action: "confirm", mapId: map.id, workflows: map.workflows, priorityWorkflowIds: map.workflows.slice(0, 3).map((item: { id: string }) => item.id) } });
  expect(confirmed.status()).toBe(200);
  const curriculum = (await confirmed.json()).curriculum;
  expect(curriculum.route).toHaveLength(8);
  expect(curriculum.route.map((item: { labId: string }) => item.labId)).toEqual(["lab-01", "lab-02", "lab-03", "lab-04", "lab-05", "lab-06", "lab-07", "lab-08"]);
});

test("Trainer Studio enforces facilitator access and a human publish gate", async ({ request }) => {
  const denied = await request.get("/api/trainer-studio", { headers: learner });
  expect(denied.status()).toBe(403);
  const fork = await request.post("/api/trainer-studio", { data: { action: "fork", name: "Review gate test" } });
  expect(fork.status()).toBe(201);
  const version = (await fork.json()).version;
  const premature = await request.post("/api/trainer-studio", { data: { action: "publish", id: version.id } });
  expect(premature.status()).toBe(409);
  await request.post("/api/trainer-studio", { data: { action: "edit", id: version.id, content: version.content, changeSummary: "Bounded scenario adaptation for this cohort." } });
  await request.post("/api/trainer-studio", { data: { action: "submit-review", id: version.id } });
  await request.post("/api/trainer-studio", { data: { action: "approve", id: version.id } });
  const published = await request.post("/api/trainer-studio", { data: { action: "publish", id: version.id } });
  expect(published.status()).toBe(200);
  expect((await published.json()).version.status).toBe("published");
});

test("Capability Ledger owns baselines and computes day-30 evidence eligibility", async ({ request }) => {
  const baselineResponse = await request.post("/api/capabilities", { headers: learner, data: { action: "baseline", workflowId: "workflow-1", workflowName: "Weekly status", metricName: "Cycle time", unit: "minutes", baselineValue: "90", targetValue: "45", measuredAt: "2026-06-01T00:00:00.000Z" } });
  expect(baselineResponse.status()).toBe(201);
  const baseline = (await baselineResponse.json()).baseline;
  const measurement = await request.post("/api/capabilities", { headers: learner, data: { action: "measurement", baselineId: baseline.id, value: "50", reflection: "The source checklist reduced rework substantially.", measuredAt: "2026-07-02T00:00:00.000Z" } });
  expect(measurement.status()).toBe(201);
  expect((await measurement.json()).day30Eligible).toBe(true);
  const ledger = await request.get("/api/capabilities", { headers: learner });
  expect((await ledger.json()).claims.some((claim: { band: string; evidence: Array<{ measurementId?: string }> }) => claim.band === "Transferred" && claim.evidence.some((item) => item.measurementId))).toBe(true);
  const foreign = await request.post("/api/capabilities", { headers: { "oai-authenticated-user-email": "other@example.com" }, data: { action: "measurement", baselineId: baseline.id, value: "10", reflection: "This should fail ownership checks." } });
  expect(foreign.status()).toBe(404);
});
