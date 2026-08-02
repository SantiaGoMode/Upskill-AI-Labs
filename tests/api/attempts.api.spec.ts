import { expect, test } from "@playwright/test";

test("attempt APIs enforce ownership and expose learner history", async ({ request }) => {
  const created = await request.post("/api/attempts", { data: { action: "start", labId: "lab-03" } });
  expect(created.status()).toBe(201);
  const { attempt } = await created.json();
  expect(attempt.ownerEmail).toBe("local-developer@upskill.invalid");

  const foreignRead = await request.get(`/api/attempts?id=${attempt.id}`, {
    headers: { "oai-authenticated-user-email": "different@example.com" },
  });
  expect(foreignRead.status()).toBe(404);

  const history = await request.get("/api/attempts?history=1");
  expect(history.status()).toBe(200);
  const historyBody = await history.json();
  expect(historyBody.attempts.some((item: { id: string }) => item.id === attempt.id)).toBe(true);
});

test("model API rejects prohibited sources before provider execution", async ({ request }) => {
  const created = await request.post("/api/attempts", { data: { action: "start", labId: "lab-01" } });
  const { attempt } = await created.json();
  const run = await request.post("/api/model-runs", {
    data: {
      attemptId: attempt.id,
      provider: "gemini",
      prompt: "Extract facts only.",
      selectedSources: ["NW-REQ-014"],
    },
  });
  expect(run.status()).toBe(400);
  expect((await run.json()).error).toContain("not permitted");
});
