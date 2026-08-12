import { and, eq } from "../../../db/firestore-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { cohorts, cohortSessions } from "../../../db/schema";
import { recordAudit } from "../../lib/governance";
import { hasFacilitatorAccess } from "../../lib/identity-trust";
import {
  createMeetSpace,
  fetchMeetRecap,
  isMeetConfigured,
  MeetApiError,
  MeetNotConfiguredError,
  normalizeMeetUrl,
} from "../../lib/google-meet";
import { serverErrorResponse } from "../../lib/observability";
import { readJsonBody } from "../../lib/request-limits";
import { facilitatorRequiredResponse, getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";

/** Confirms the caller owns the cohort that owns this session. */
async function ownedSession(sessionId: string, email: string) {
  const [row] = await getDb()
    .select({
      id: cohortSessions.id,
      title: cohortSessions.title,
      meetingUri: cohortSessions.meetingUri,
      meetingSpace: cohortSessions.meetingSpace,
      meetingCode: cohortSessions.meetingCode,
      meetingSource: cohortSessions.meetingSource,
      ownerEmail: cohorts.ownerEmail,
    })
    .from(cohortSessions)
    .innerJoin(cohorts, eq(cohorts.id, cohortSessions.cohortId))
    .where(and(eq(cohortSessions.id, sessionId), eq(cohorts.ownerEmail, email)))
    .limit(1);
  return row ?? null;
}

export async function GET(request: Request) {
  await ensureLabSchema();
  const identity = await getRequestIdentity(request);
  if (!identity) return unauthorizedResponse();
  return Response.json({ configured: isMeetConfigured() });
}

export async function POST(request: Request) {
  try {
    await ensureLabSchema();
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorizedResponse();
    if (!hasFacilitatorAccess(identity)) return facilitatorRequiredResponse();

    const parsed = await readJsonBody<{ action?: string; sessionId?: string; meetingUri?: string }>(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    const sessionId = String(body.sessionId ?? "");
    const session = await ownedSession(sessionId, identity.email);
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

    const db = getDb();

    if (body.action === "create-space") {
      const space = await createMeetSpace();
      const [row] = await db
        .update(cohortSessions)
        .set({
          meetingUri: space.meetingUri,
          meetingSpace: space.name,
          meetingCode: space.meetingCode,
          meetingSource: "api",
        })
        .where(eq(cohortSessions.id, sessionId))
        .returning();
      await recordAudit(identity.email, "meet.space-created", "cohort-session", sessionId, { space: space.name });
      return Response.json({ session: row }, { status: 201 });
    }

    if (body.action === "set-link") {
      const meetingUri = normalizeMeetUrl(String(body.meetingUri ?? ""));
      if (!meetingUri) {
        return Response.json({ error: "Enter a valid https://meet.google.com/… link" }, { status: 400 });
      }
      const [row] = await db
        .update(cohortSessions)
        .set({ meetingUri, meetingSpace: null, meetingCode: null, meetingSource: "manual" })
        .where(eq(cohortSessions.id, sessionId))
        .returning();
      await recordAudit(identity.email, "meet.link-set", "cohort-session", sessionId);
      return Response.json({ session: row });
    }

    if (body.action === "clear-link") {
      const [row] = await db
        .update(cohortSessions)
        .set({ meetingUri: null, meetingSpace: null, meetingCode: null, meetingSource: null })
        .where(eq(cohortSessions.id, sessionId))
        .returning();
      return Response.json({ session: row });
    }

    if (body.action === "recap") {
      if (!session.meetingSpace) {
        return Response.json(
          { error: "A recap is only available for meetings this app created through the Meet API." },
          { status: 409 },
        );
      }
      const recap = await fetchMeetRecap(session.meetingSpace);
      return Response.json({ recap });
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    if (error instanceof MeetNotConfiguredError) return Response.json({ error: error.message }, { status: 501 });
    if (error instanceof MeetApiError) return Response.json({ error: error.message }, { status: error.status });
    return serverErrorResponse("meet", error, "The Meet request could not be completed.");
  }
}
