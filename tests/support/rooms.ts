import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Publishes a curriculum version, creates a cohort, schedules a session, and opens
 * its Live Room. Returns the session id. Shared by the API and browser suites so the
 * two exercise an identical room.
 */
export async function openRoom(request: APIRequestContext, label: string) {
  return (await createCohortRoom(request, label)).sessionId;
}

/**
 * Same setup, but also returns the learner invitation token so a test can sign that
 * learner in and act as a genuine cohort member, or as a member of a different cohort.
 */
export async function createCohortRoom(request: APIRequestContext, label: string) {
  const fork = await request.post("/api/trainer-studio", { data: { action: "fork", name: `${label} pathway` } });
  const version = (await fork.json()).version;
  await request.post("/api/trainer-studio", { data: { action: "edit", id: version.id, content: version.content, changeSummary: `${label} setup.` } });
  await request.post("/api/trainer-studio", { data: { action: "submit-review", id: version.id } });
  await request.post("/api/trainer-studio", { data: { action: "approve", id: version.id } });
  await request.post("/api/trainer-studio", { data: { action: "publish", id: version.id } });

  const created = await request.post("/api/trainer-studio", {
    data: {
      action: "create-cohort",
      name: `${label} cohort`,
      curriculumVersionId: version.id,
      learnerEmails: [`${label}-learner@example.com`],
    },
  });
  const createdBody = await created.json() as {
    cohort: { id: string };
    invitations: Array<{ token: string }>;
  };
  const cohortId = createdBody.cohort.id;

  const scheduled = await request.post("/api/cohorts", {
    data: {
      action: "schedule-session",
      cohortId,
      title: `${label} session`,
      scheduledAt: "2026-09-01T16:00:00.000Z",
      durationMinutes: 60,
      agenda: `${label} agenda.`,
    },
  });
  const sessionId = (await scheduled.json()).session.id as string;

  expect((await request.post("/api/live-room", { data: { action: "open-room", sessionId } })).status()).toBe(201);
  return { sessionId, cohortId, inviteToken: createdBody.invitations[0].token };
}
