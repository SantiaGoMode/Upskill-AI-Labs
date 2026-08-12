import { and, eq } from "../../db/firestore-orm";
import { getDb } from "../../db";
import { cohortEnrollments, cohorts, cohortSessions } from "../../db/schema";
import { hasFacilitatorAccess, type RequestIdentity } from "./identity-trust";
import { publishLiveRoomSignal } from "./live-room-signals";
import { logWarning } from "./observability";

/**
 * Who may see a Live Room. Shared by the REST route and the change channel, so a
 * channel can never be opened on a session the caller could not
 * already read.
 */
export async function liveRoomAccess(sessionId: string, identity: RequestIdentity) {
  const db = getDb();
  const [session] = await db.select({
    id: cohortSessions.id,
    cohortId: cohortSessions.cohortId,
    title: cohortSessions.title,
    scheduledAt: cohortSessions.scheduledAt,
    durationMinutes: cohortSessions.durationMinutes,
    agenda: cohortSessions.agenda,
    status: cohortSessions.status,
    meetingUri: cohortSessions.meetingUri,
    ownerEmail: cohorts.ownerEmail,
    cohortName: cohorts.name,
  }).from(cohortSessions).innerJoin(cohorts, eq(cohorts.id, cohortSessions.cohortId))
    .where(eq(cohortSessions.id, sessionId)).limit(1);
  if (!session) return null;

  const facilitator = hasFacilitatorAccess(identity) && session.ownerEmail === identity.email;
  const [enrollment] = facilitator ? [] : await db.select().from(cohortEnrollments)
    .where(and(eq(cohortEnrollments.cohortId, session.cohortId), eq(cohortEnrollments.learnerEmail, identity.email))).limit(1);
  return facilitator || enrollment ? { session, facilitator } : null;
}

/** Actions that change nothing another participant can see need no broadcast. */
const SILENT_ACTIONS = new Set(["heartbeat"]);

/**
 * Tells the session's channel that the room changed, so peers refetch instead of
 * polling on a timer. Never throws: a failed notification degrades a client to its
 * fallback poll, which is not worth failing the write that already succeeded.
 */
export async function notifyLiveRoom(sessionId: string, action: string) {
  if (SILENT_ACTIONS.has(action)) return;
  try {
    await publishLiveRoomSignal(sessionId, action);
  } catch (error) {
    logWarning("live_room_broadcast_failed", {
      sessionId,
      action,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
