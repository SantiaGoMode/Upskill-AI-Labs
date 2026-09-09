import { afterEach, expect, it, vi } from "vitest";
import { getDb } from "../../db";
import { eq } from "../../db/firestore-orm";
import * as schema from "../../db/schema";
import { createErasureRecoverySession, deleteLearnerData, erasurePending } from "../../app/lib/account-erasure";
import { exportLearnerData } from "../../app/lib/retention";
import { getRequestIdentity, sessionSecret } from "../../app/lib/request-identity";
import { createSessionToken } from "../../app/lib/session-token";

const db = getDb();
const email = `erasure-${crypto.randomUUID()}@example.com`;
const peer = `peer-${crypto.randomUUID()}@example.com`;
const prefix = crypto.randomUUID();
afterEach(() => vi.restoreAllMocks());

it("resumes a partially committed manifest and preserves authentication until completion", async () => {
  await db.insert(schema.localUsers).values({ email, displayName: "Learner", role: "learner" });
  await db.insert(schema.localSessions).values({ id: `${prefix}-session`, userEmail: email, expiresAt: "2099-01-01" });
  await db.insert(schema.labAttempts).values({ id: prefix, ownerEmail: email, labId: "lab-01" });
  await db.insert(schema.labSubmissions).values({ id: prefix, attemptId: prefix, payloadJson: "{}" });
  await db.insert(schema.evalResults).values(Array.from({ length: 150 }, (_, index) => ({
    id: `${prefix}-${index}`, submissionId: prefix, evaluatorVersion: "test", resultJson: "{}", passed: true,
  })));
  await db.insert(schema.cohorts).values({ id: prefix, ownerEmail: peer, name: "Shared", curriculumVersionId: "test", learnerEmailsJson: JSON.stringify([email, peer]) });
  await db.insert(schema.organizationMembers).values({ id: prefix, organizationId: "test", email, displayName: "Learner", role: "learner", inviteToken: "private-token" });
  await db.insert(schema.cohortEnrollments).values({ id: prefix, cohortId: prefix, learnerEmail: email });
  await db.insert(schema.liveRoomParticipants).values({ id: prefix, roomId: "test", userEmail: email, displayName: "Learner", role: "learner" });
  await db.insert(schema.cohortInterventions).values({ id: prefix, cohortId: prefix, learnerEmail: email, facilitatorEmail: peer, note: "Private coaching" });
  const exported = await exportLearnerData(email);
  expect(exported.memberships).toHaveLength(1);
  expect(exported.memberships[0]).not.toHaveProperty("inviteToken");
  expect(exported.sessions[0]).not.toHaveProperty("id");
  expect(exported.cohortRoster[0]).not.toHaveProperty("learnerEmailsJson");
  expect(exported.interventions).toHaveLength(1);

  const original = db.transaction.bind(db);
  let injected = false;
  vi.spyOn(db, "transaction").mockImplementation((work) => original((tx) => work({
    ...tx,
    put: (table, id, row) => {
      if (table === schema.accountErasures.tableName && row.nextPage === 2 && !injected) {
        injected = true;
        throw new Error("injected second-page failure");
      }
      tx.put(table, id, row);
    },
  })));
  await expect(deleteLearnerData(email, `${prefix}-session`)).rejects.toThrow("injected second-page failure");
  vi.restoreAllMocks();
  expect(await erasurePending(email)).toBe(true);
  await expect(db.insert(schema.labAttempts).values({ id: `${prefix}-late`, ownerEmail: email, labId: "lab-01" })).rejects.toThrow("erasure is pending");
  expect(await db.select().from(schema.localSessions).where(eq(schema.localSessions.id, `${prefix}-session`))).toHaveLength(1);
  expect(await db.select().from(schema.evalResults).where(eq(schema.evalResults.submissionId, prefix))).toHaveLength(50);
  const headers = { "oai-authenticated-user-email": email };
  expect(await getRequestIdentity(new Request("http://localhost:3100/api/attempts", { headers }))).toBeNull();
  expect(await getRequestIdentity(new Request("http://localhost:3100/api/account", { headers }))).not.toBeNull();
  const cookie = `upskill_session=${await createSessionToken(`${prefix}-session`, sessionSecret())}`;
  expect((await getRequestIdentity(new Request("https://app.example/api/account", { headers: { cookie } })))?.email).toBe(email);

  // Even if a parent disappears, the saved manifest still identifies its children.
  await db.delete(schema.labAttempts).where(eq(schema.labAttempts.id, prefix));
  const recoveryId = await createErasureRecoverySession(email, "2099-01-01");
  const recoveryCookie = `upskill_session=${await createSessionToken(recoveryId, sessionSecret())}`;
  expect((await getRequestIdentity(new Request("https://app.example/api/account", { headers: { cookie: recoveryCookie } })))?.email).toBe(email);
  expect(await getRequestIdentity(new Request("https://app.example/api/attempts", { headers: { cookie: recoveryCookie } }))).toBeNull();
  const counts = await deleteLearnerData(email, recoveryId);
  expect(counts.evaluations).toBe(150);
  expect(counts.sessions).toBe(2);
  expect(await erasurePending(email)).toBe(false);
  await expect(db.insert(schema.modelRuns).values({ id: `${prefix}-late-run`, attemptId: prefix })).rejects.toThrow("missing attempt");
  await expect(db.insert(schema.labAttempts).values({ id: `${prefix}-late`, ownerEmail: email, labId: "lab-01" })).rejects.toThrow("Account was erased");
  expect(await db.select().from(schema.evalResults).where(eq(schema.evalResults.submissionId, prefix))).toEqual([]);
  expect(await db.select().from(schema.localSessions).where(eq(schema.localSessions.id, `${prefix}-session`))).toEqual([]);
  expect(await db.select().from(schema.localSessions).where(eq(schema.localSessions.id, recoveryId))).toEqual([]);
  const after = await exportLearnerData(email);
  expect(after.memberships).toEqual([]);
  expect(after.enrollments).toEqual([]);
  expect(after.presence).toEqual([]);
  expect(after.interventions).toEqual([]);
  const [cohort] = await db.select().from(schema.cohorts).where(eq(schema.cohorts.id, prefix));
  expect(JSON.parse(cohort.learnerEmailsJson)).toEqual([peer]);
  expect(await deleteLearnerData(email)).toEqual(counts);
  const [job] = (await db.select().from(schema.accountErasures)).filter((row) => JSON.parse(row.countsJson).evaluations === 150);
  expect(await db.select().from(schema.accountErasurePages).where(eq(schema.accountErasurePages.jobId, job.id))).toEqual([]);
  await db.delete(schema.cohorts).where(eq(schema.cohorts.id, prefix));
  const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.actorEmail, email));
  expect(audit.filter((row) => row.action === "account.erased")).toHaveLength(1);
  await db.delete(schema.auditEvents).where(eq(schema.auditEvents.actorEmail, email));
  await db.delete(schema.accountErasures).where(eq(schema.accountErasures.id, job.id));
});
