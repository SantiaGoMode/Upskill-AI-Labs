import { expect, test } from "@playwright/test";

const learner = { "oai-authenticated-user-email": "rights-learner@example.com" };

test("a learner can export their own data and only their own", async ({ request }) => {
  // Create something to export.
  const started = await request.post("/api/attempts", { headers: learner, data: { action: "start", labId: "lab-02" } });
  expect(started.status()).toBe(201);
  const { attempt } = await started.json() as { attempt: { id: string } };

  const exported = await request.get("/api/account?action=export", { headers: learner });
  expect(exported.status()).toBe(200);
  expect(exported.headers()["content-disposition"]).toContain("attachment");

  const data = await exported.json() as { email: string; attempts: Array<{ id: string; ownerEmail: string }> };
  expect(data.email).toBe("rights-learner@example.com");
  expect(data.attempts.some((row) => row.id === attempt.id)).toBe(true);
  expect(data.attempts.every((row) => row.ownerEmail === "rights-learner@example.com")).toBe(true);

  const other = await request.get("/api/account?action=export", {
    headers: { "oai-authenticated-user-email": "rights-other@example.com" },
  });
  expect(other.status()).toBe(200);
  const otherData = await other.json() as { attempts: Array<{ id: string }> };
  expect(otherData.attempts.some((row) => row.id === attempt.id)).toBe(false);
});

test("erasure requires the caller's own address and then removes their records", async ({ request }) => {
  const headers = { "oai-authenticated-user-email": "erase-me@example.com" };
  const started = await request.post("/api/attempts", { headers, data: { action: "start", labId: "lab-03" } });
  const { attempt } = await started.json() as { attempt: { id: string } };

  // A mismatched confirmation must not delete anything.
  const refused = await request.post("/api/account", { headers, data: { action: "delete", confirmEmail: "someone-else@example.com" } });
  expect(refused.status()).toBe(400);
  const stillThere = await request.get(`/api/attempts?id=${attempt.id}`, { headers });
  expect(stillThere.status()).toBe(200);

  const erased = await request.post("/api/account", { headers, data: { action: "delete", confirmEmail: "erase-me@example.com" } });
  expect(erased.status()).toBe(200);
  const { deleted } = await erased.json() as { deleted: Record<string, number> };
  expect(deleted.attempts).toBeGreaterThanOrEqual(1);

  const gone = await request.get(`/api/attempts?id=${attempt.id}`, { headers });
  expect(gone.status()).toBe(404);
});

test("the retention purge is facilitator-only and reports what it removed", async ({ request }) => {
  const asLearner = await request.post("/api/governance", {
    headers: { "oai-authenticated-user-email": "retention-learner@example.com" },
    data: { action: "purge-retention" },
  });
  expect(asLearner.status()).toBe(403);

  // The local development identity is a facilitator by default.
  const purged = await request.post("/api/governance", { data: { action: "purge-retention" } });
  expect(purged.status()).toBe(200);
  const body = await purged.json() as { retentionDays: number; deleted: Record<string, number> };
  expect(body.retentionDays).toBeGreaterThan(0);
  expect(body.deleted).toHaveProperty("localSessions");
});

test("a governance read reports the retention window", async ({ request }) => {
  const response = await request.get("/api/governance");
  expect(response.status()).toBe(200);
  const body = await response.json() as { retention: { retentionDays: number; expiring: number } };
  expect(body.retention.retentionDays).toBeGreaterThan(0);
  expect(body.retention.expiring).toBeGreaterThanOrEqual(0);
});
