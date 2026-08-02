import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { cohortEnrollments, cohorts, cohortSessions, liveRoomBoardCards, liveRoomParticipants, liveRooms } from "../../../db/schema";
import { recordAudit } from "../../lib/governance";
import { getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";

type Identity = NonNullable<Awaited<ReturnType<typeof getRequestIdentity>>>;

async function accessFor(sessionId: string, identity: Identity) {
  const db = getDb();
  const [session] = await db.select({
    id: cohortSessions.id,
    cohortId: cohortSessions.cohortId,
    title: cohortSessions.title,
    scheduledAt: cohortSessions.scheduledAt,
    durationMinutes: cohortSessions.durationMinutes,
    agenda: cohortSessions.agenda,
    status: cohortSessions.status,
    ownerEmail: cohorts.ownerEmail,
    cohortName: cohorts.name,
  }).from(cohortSessions).innerJoin(cohorts, eq(cohorts.id, cohortSessions.cohortId))
    .where(eq(cohortSessions.id, sessionId)).limit(1);
  if (!session) return null;
  const facilitator = identity.role === "facilitator" && session.ownerEmail === identity.email;
  const [enrollment] = facilitator ? [] : await db.select().from(cohortEnrollments)
    .where(and(eq(cohortEnrollments.cohortId, session.cohortId), eq(cohortEnrollments.learnerEmail, identity.email))).limit(1);
  return facilitator || enrollment ? { session, facilitator } : null;
}

async function roomView(sessionId: string, identity: Identity) {
  const access = await accessFor(sessionId, identity);
  if (!access) return null;
  const db = getDb();
  const [room] = await db.select().from(liveRooms).where(eq(liveRooms.sessionId, sessionId)).orderBy(desc(liveRooms.openedAt)).limit(1);
  if (!room) return { ...access, room: null, participants: [], cards: [] };
  const participants = await db.select().from(liveRoomParticipants).where(and(eq(liveRoomParticipants.roomId, room.id), eq(liveRoomParticipants.status, "present"))).orderBy(liveRoomParticipants.joinedAt);
  const cards = await db.select().from(liveRoomBoardCards).where(eq(liveRoomBoardCards.roomId, room.id)).orderBy(liveRoomBoardCards.createdAt);
  return {
    ...access,
    room,
    participants: access.facilitator
      ? participants
      : participants.map((participant) => ({ id: participant.id, displayName: participant.userEmail === identity.email ? "You" : participant.role === "facilitator" ? participant.displayName : "Learner", role: participant.role, status: participant.status, lastSeenAt: participant.lastSeenAt })),
    cards: cards.map((card) => ({ ...card, authorEmail: access.facilitator ? card.authorEmail : card.authorEmail === identity.email ? "you" : "participant" })),
  };
}

export async function GET(request: Request) {
  await ensureLabSchema();
  const identity = await getRequestIdentity(request);
  if (!identity) return unauthorizedResponse();
  const sessionId = new URL(request.url).searchParams.get("sessionId") ?? "";
  if (!sessionId) return Response.json({ error: "sessionId is required" }, { status: 400 });
  const view = await roomView(sessionId, identity);
  if (!view) return Response.json({ error: "Live session not found" }, { status: 404 });
  return Response.json({ identity, ...view });
}

export async function POST(request: Request) {
  await ensureLabSchema();
  const identity = await getRequestIdentity(request);
  if (!identity) return unauthorizedResponse();
  const body = await request.json() as Record<string, unknown>;
  const sessionId = String(body.sessionId ?? "");
  const action = String(body.action ?? "");
  const access = await accessFor(sessionId, identity);
  if (!access) return Response.json({ error: "Live session not found" }, { status: 404 });
  const db = getDb();
  let [room] = await db.select().from(liveRooms).where(eq(liveRooms.sessionId, sessionId)).orderBy(desc(liveRooms.openedAt)).limit(1);

  if (action === "open-room") {
    if (!access.facilitator) return Response.json({ error: "Only the facilitator can open this room" }, { status: 403 });
    const now = new Date().toISOString();
    if (!room || room.status === "closed") {
      [room] = await db.insert(liveRooms).values({ id: crypto.randomUUID(), sessionId, openedBy: identity.email, openedAt: now, updatedAt: now }).returning();
    } else {
      [room] = await db.update(liveRooms).set({ status: "open", closedAt: null, updatedAt: now }).where(eq(liveRooms.id, room.id)).returning();
    }
    await db.update(cohortSessions).set({ status: "live" }).where(eq(cohortSessions.id, sessionId));
    await recordAudit(identity.email, "live-room.opened", "cohort-session", sessionId, { roomId: room.id });
  } else if (!room || room.status !== "open") {
    return Response.json({ error: "The facilitator has not opened this room" }, { status: 409 });
  }

  if (action === "join" || action === "heartbeat" || action === "open-room") {
    const now = new Date().toISOString();
    const [existing] = await db.select().from(liveRoomParticipants).where(and(eq(liveRoomParticipants.roomId, room.id), eq(liveRoomParticipants.userEmail, identity.email))).limit(1);
    if (existing) await db.update(liveRoomParticipants).set({ status: "present", displayName: identity.displayName, role: identity.role, lastSeenAt: now, leftAt: null }).where(eq(liveRoomParticipants.id, existing.id));
    else await db.insert(liveRoomParticipants).values({ id: crypto.randomUUID(), roomId: room.id, userEmail: identity.email, displayName: identity.displayName, role: identity.role, joinedAt: now, lastSeenAt: now });
  } else if (action === "set-section") {
    if (!access.facilitator) return Response.json({ error: "Only the facilitator can control lesson progression" }, { status: 403 });
    const labId = String(body.labId ?? ""); const section = String(body.section ?? "").trim();
    if (!/^lab-0[1-8]$/.test(labId) || section.length < 2) return Response.json({ error: "A valid lab and section are required" }, { status: 400 });
    await db.update(liveRooms).set({ currentLabId: labId, currentSection: section.slice(0, 160), updatedAt: new Date().toISOString() }).where(eq(liveRooms.id, room.id));
  } else if (action === "share-prompt") {
    if (!access.facilitator) return Response.json({ error: "Only the facilitator can share a room prompt" }, { status: 403 });
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) return Response.json({ error: "Prompt text is required" }, { status: 400 });
    await db.update(liveRooms).set({ sharedPrompt: prompt.slice(0, 4000), updatedAt: new Date().toISOString() }).where(eq(liveRooms.id, room.id));
  } else if (action === "add-card") {
    const cardBody = String(body.body ?? "").trim(); const color = String(body.color ?? "blue");
    if (!cardBody) return Response.json({ error: "Whiteboard note is required" }, { status: 400 });
    await db.insert(liveRoomBoardCards).values({ id: crypto.randomUUID(), roomId: room.id, sectionKey: room.currentLabId, authorEmail: identity.email, body: cardBody.slice(0, 500), color: ["blue", "yellow", "green", "pink"].includes(color) ? color : "blue" });
  } else if (action === "clear-board") {
    if (!access.facilitator) return Response.json({ error: "Only the facilitator can clear the whiteboard" }, { status: 403 });
    await db.delete(liveRoomBoardCards).where(and(eq(liveRoomBoardCards.roomId, room.id), eq(liveRoomBoardCards.sectionKey, room.currentLabId)));
  } else if (action === "leave") {
    await db.update(liveRoomParticipants).set({ status: "left", leftAt: new Date().toISOString() }).where(and(eq(liveRoomParticipants.roomId, room.id), eq(liveRoomParticipants.userEmail, identity.email)));
  } else if (action === "close-room") {
    if (!access.facilitator) return Response.json({ error: "Only the facilitator can close this room" }, { status: 403 });
    const now = new Date().toISOString();
    await db.update(liveRooms).set({ status: "closed", closedAt: now, updatedAt: now }).where(eq(liveRooms.id, room.id));
    await db.update(cohortSessions).set({ status: "completed" }).where(eq(cohortSessions.id, sessionId));
    await db.update(liveRoomParticipants).set({ status: "left", leftAt: now }).where(eq(liveRoomParticipants.roomId, room.id));
    await recordAudit(identity.email, "live-room.closed", "cohort-session", sessionId, { roomId: room.id });
  } else if (!["join", "heartbeat", "open-room"].includes(action)) {
    return Response.json({ error: "Unsupported action" }, { status: 400 });
  }

  const view = await roomView(sessionId, identity);
  return Response.json({ identity, ...view }, { status: action === "open-room" ? 201 : 200 });
}
