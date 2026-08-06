import { expect, test } from "@playwright/test";

/**
 * The tenant boundary between two facilitators, and the request bounds that keep
 * an authenticated caller from spending or storing without limit.
 *
 * `role: facilitator` establishes that someone is a trainer, never whose learners
 * they are. These specs use two facilitators with no relationship to each other,
 * which is the case where a role-only check silently passes and an ownership
 * check does not.
 */

const facilitator = (email: string) => ({
  "oai-authenticated-user-email": email,
  "oai-authenticated-user-role": "facilitator",
});

const alice = facilitator("alice-trainer@example.com");
const mallory = facilitator("mallory-trainer@example.com");

test("a facilitator cannot read or advance another facilitator's curriculum", async ({ request }) => {
  const fork = await request.post("/api/trainer-studio", { headers: alice, data: { action: "fork", name: "Alice private pathway" } });
  expect(fork.status()).toBe(201);
  const version = (await fork.json()).version as { id: string; content: unknown };

  const foreignList = await request.get("/api/trainer-studio", { headers: mallory });
  expect(foreignList.status()).toBe(200);
  const listed = (await foreignList.json()).versions as Array<{ id: string }>;
  expect(listed.some((item) => item.id === version.id)).toBe(false);

  // Each write is addressed by id and owner, so an id guessed or read elsewhere
  // is not enough to edit, review, or publish someone else's pathway.
  for (const action of ["edit", "submit-review", "approve", "publish"]) {
    const attempt = await request.post("/api/trainer-studio", {
      headers: mallory,
      data: { action, id: version.id, content: version.content, changeSummary: "Taking over this pathway." },
    });
    expect(attempt.status(), `${action} must not reach another facilitator's version`).toBe(404);
  }

  const stillDraft = await request.get("/api/trainer-studio", { headers: alice });
  const owned = ((await stillDraft.json()).versions as Array<{ id: string; status: string }>)
    .find((item) => item.id === version.id);
  expect(owned?.status).toBe("draft");
});

test("a facilitator's calibration dashboard holds only their own cohort's work", async ({ request }) => {
  const learner = { "oai-authenticated-user-email": "alice-learner@example.com" };

  const fork = await request.post("/api/trainer-studio", { headers: alice, data: { action: "fork", name: "Alice cohort pathway" } });
  const version = (await fork.json()).version as { id: string; content: unknown };
  await request.post("/api/trainer-studio", { headers: alice, data: { action: "edit", id: version.id, content: version.content, changeSummary: "Ready for an operational cohort." } });
  await request.post("/api/trainer-studio", { headers: alice, data: { action: "submit-review", id: version.id } });
  await request.post("/api/trainer-studio", { headers: alice, data: { action: "approve", id: version.id } });
  await request.post("/api/trainer-studio", { headers: alice, data: { action: "publish", id: version.id } });
  const cohort = await request.post("/api/trainer-studio", {
    headers: alice,
    data: { action: "create-cohort", name: "Alice August", curriculumVersionId: version.id, learnerEmails: ["alice-learner@example.com"] },
  });
  expect(cohort.status()).toBe(201);

  const start = await request.post("/api/attempts", { headers: learner, data: { action: "start", labId: "lab-02" } });
  const attempt = (await start.json()).attempt as { id: string };
  const submit = await request.post("/api/attempts", {
    headers: learner,
    data: {
      action: "submit",
      id: attempt.id,
      payload: {
        draft: { ragStatus: "Amber", statusRationale: "NW-PLAN-08 conflict; human owner", achievements: "NW-UPDATE-A", risks: "NW-METRICS-05", decisions: "Committee decision", commitments: "Owner verifies" },
        prompt: "Use source evidence, cite IDs, use Unknown, preserve conflicts, human decides",
        selectedSources: ["NW-PLAN-08"],
        verification: "Verified sources, excluded untrusted content, missing evidence is Unknown",
        secondsRemaining: 900,
      },
    },
  });
  const submissionId = (await submit.json()).submissionId as string;

  const owning = await request.get("/api/evaluations?dashboard=1", { headers: alice });
  const ownedIds = ((await owning.json()).submissions as Array<{ id: string }>).map((item) => item.id);
  expect(ownedIds).toContain(submissionId);

  const foreign = await request.get("/api/evaluations?dashboard=1", { headers: mallory });
  expect(foreign.status()).toBe(200);
  const foreignBody = await foreign.text();
  expect(foreignBody).not.toContain(submissionId);
  expect(foreignBody).not.toContain("alice-learner@example.com");

  // Nor may an unrelated facilitator grade, or spend model budget on, that work.
  const graded = await request.post("/api/evaluations", {
    headers: mallory,
    data: { action: "human-review", submissionId, rationale: "Grading a stranger's artifact.", bands: { grounding: "Strong", completeness: "Strong", judgment: "Strong", efficiency: "Strong", guardrails: "Strong" } },
  });
  expect(graded.status()).toBe(404);
});

test("an oversized prompt is refused before a provider is contacted", async ({ request }) => {
  const start = await request.post("/api/attempts", { data: { action: "start", labId: "lab-01" } });
  const attempt = (await start.json()).attempt as { id: string };

  const response = await request.post("/api/model-runs", {
    data: { attemptId: attempt.id, provider: "gemini", prompt: "x".repeat(8_001), selectedSources: ["NW-EMAIL-01"] },
  });
  expect(response.status()).toBe(413);
});

test("a body larger than the ceiling is refused without being parsed", async ({ request }) => {
  const response = await request.post("/api/attempts", {
    headers: { "content-type": "application/json" },
    data: { action: "start", labId: "lab-01", filler: "x".repeat(300_000) },
  });
  expect(response.status()).toBe(413);
});

test("a malformed body is a client error rather than a server error", async ({ request }) => {
  const response = await request.post("/api/cohorts", {
    headers: { "content-type": "application/json" },
    data: "{ not json",
  });
  expect(response.status()).toBe(400);
});

/**
 * End-to-end confirmation only. Under `vinext dev` the framework's own dev-origin
 * guard answers first, so the worker's check is covered by
 * `tests/unit/cross-site.test.ts` rather than by this spec.
 */
test("a cross-site state-changing request is refused", async ({ request }) => {
  const response = await request.post("/api/attempts", {
    headers: { origin: "https://attacker.example" },
    data: { action: "start", labId: "lab-01" },
  });
  expect(response.status()).toBe(403);

  // A same-origin request from a browser carries an Origin too, and must pass.
  const sameOrigin = await request.post("/api/attempts", {
    headers: { origin: "http://localhost:3100" },
    data: { action: "start", labId: "lab-01" },
  });
  expect(sameOrigin.status()).toBe(201);
});
