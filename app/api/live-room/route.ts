import { and, desc, eq, sql } from "../../../db/firestore-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { cohortSessions, liveRoomBoardCards, liveRoomParticipants, liveRooms } from "../../../db/schema";
import { activePolicy, permitsProvider, recordAudit } from "../../lib/governance";
import { liveRoomAccess, notifyLiveRoom } from "../../lib/live-room-access";
import { assertModelBudget, budgetErrorResponse, ModelBudgetError, recordModelUsage } from "../../lib/model-budget";
import { estimateModelCost } from "../../lib/model-pricing";
import { executeModelProvider, getProviderStatuses, ProviderError } from "../../lib/model-providers";
import { isModelProvider } from "../../lib/model-run-types";
import { resolveSourceText } from "../../lib/source-text";
import { serverErrorResponse } from "../../lib/observability";
import { boundedText, MAX_CARDS_PER_ROOM, MAX_PROMPT_CHARS, readJsonBody } from "../../lib/request-limits";
import { getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";

type Identity = NonNullable<Awaited<ReturnType<typeof getRequestIdentity>>>;

const CARD_KINDS = ["note", "prompt", "artifact", "text", "ink", "output", "workflow"] as const;
const CARD_COLORS = ["blue", "yellow", "green", "pink", "ink"] as const;

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const clampCoord = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-20_000, Math.min(20_000, Math.round(number))) : fallback;
};

const clampSize = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(60, Math.min(1600, Math.round(number))) : fallback;
};

const asStringArray = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

type CardRow = typeof liveRoomBoardCards.$inferSelect;

/** Edges are stored on the target: payload.inputs holds the ids that feed it. */
const inputsOf = (card: CardRow) => asStringArray(parsePayload(card.payload).inputs);

/**
 * Walks the inputs of an executable card and returns what it should be given:
 * Northwind source IDs from artifact cards, and prior text from output cards.
 */
function gatherInputs(card: CardRow, byId: Map<string, CardRow>, seen = new Set<string>()): { sourceIds: string[]; priorText: string[] } {
  const sourceIds: string[] = [];
  const priorText: string[] = [];
  for (const inputId of inputsOf(card)) {
    if (seen.has(inputId)) continue;
    seen.add(inputId);
    const input = byId.get(inputId);
    if (!input) continue;
    if (input.kind === "artifact") {
      const sourceId = String(parsePayload(input.payload).sourceId ?? input.body.split(" ")[0] ?? "").trim();
      if (sourceId) sourceIds.push(sourceId);
    } else if (input.kind === "output" || input.kind === "note" || input.kind === "text") {
      priorText.push(`${input.kind === "output" ? "PREVIOUS STEP OUTPUT" : "NOTE"}:\n${input.body}`);
    } else if (input.kind === "prompt" || input.kind === "workflow") {
      const nested = gatherInputs(input, byId, seen);
      sourceIds.push(...nested.sourceIds);
    }
  }
  return { sourceIds, priorText };
}

/** Orders a workflow chain so each node runs after everything feeding it. */
function chainOrder(startId: string, byId: Map<string, CardRow>): CardRow[] {
  const ordered: CardRow[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  function visit(id: string) {
    if (done.has(id) || visiting.has(id)) return;
    const card = byId.get(id);
    if (!card || (card.kind !== "workflow" && card.kind !== "prompt")) return;
    visiting.add(id);
    for (const inputId of inputsOf(card)) visit(inputId);
    visiting.delete(id);
    done.add(id);
    ordered.push(card);
  }
  visit(startId);
  return ordered;
}


const accessFor = liveRoomAccess;

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
    cards: cards.map((card) => ({
      ...card,
      payload: parsePayload(card.payload),
      mine: card.authorEmail === identity.email,
      authorEmail: access.facilitator ? card.authorEmail : card.authorEmail === identity.email ? "you" : "participant",
    })),
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
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
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
    const prompt = boundedText(body.prompt, MAX_PROMPT_CHARS).trim();
    if (!prompt) return Response.json({ error: "Prompt text is required" }, { status: 400 });
    await db.update(liveRooms).set({ sharedPrompt: prompt.slice(0, 4000), updatedAt: new Date().toISOString() }).where(eq(liveRooms.id, room.id));
  } else if (action === "add-card") {
    // Any participant may add to the shared board, so the board needs a ceiling
    // of its own: one learner should not be able to fill the room's storage.
    const [existingCards] = await db.select({ count: sql<number>`count(*)` }).from(liveRoomBoardCards)
      .where(eq(liveRoomBoardCards.roomId, room.id));
    if (Number(existingCards?.count ?? 0) >= MAX_CARDS_PER_ROOM) {
      return Response.json({ error: "This whiteboard is full. Clear it before adding more." }, { status: 409 });
    }
    const kind = CARD_KINDS.includes(String(body.kind) as never) ? String(body.kind) : "note";
    const cardBody = boundedText(body.body, 2000).trim();
    // Ink carries its geometry in the payload, so it is the one kind with no text.
    if (kind !== "ink" && !cardBody) return Response.json({ error: "Whiteboard note is required" }, { status: 400 });
    const color = CARD_COLORS.includes(String(body.color) as never) ? String(body.color) : "blue";
    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
    const serialized = JSON.stringify(payload);
    if (serialized.length > 20_000) return Response.json({ error: "Whiteboard object is too large" }, { status: 400 });
    const [card] = await db.insert(liveRoomBoardCards).values({
      id: crypto.randomUUID(),
      roomId: room.id,
      sectionKey: room.currentLabId,
      authorEmail: identity.email,
      body: cardBody.slice(0, 2000),
      color,
      kind,
      x: clampCoord(body.x, 40),
      y: clampCoord(body.y, 40),
      width: clampSize(body.width, 220),
      height: clampSize(body.height, 140),
      payload: serialized,
    }).returning();
    await notifyLiveRoom(sessionId, action);
    return Response.json({ identity, ...(await roomView(sessionId, identity)), createdCardId: card.id }, { status: 201 });
  } else if (action === "move-card" || action === "update-card" || action === "delete-card") {
    const cardId = String(body.cardId ?? "");
    const [card] = await db.select().from(liveRoomBoardCards)
      .where(and(eq(liveRoomBoardCards.id, cardId), eq(liveRoomBoardCards.roomId, room.id))).limit(1);
    if (!card) return Response.json({ error: "Whiteboard object not found" }, { status: 404 });
    // Anyone in the room may reposition a shared object; only its author or the
    // facilitator may change its content or remove it.
    const mayMutate = access.facilitator || card.authorEmail === identity.email;

    if (action === "delete-card") {
      if (!mayMutate) return Response.json({ error: "Only the author or facilitator can delete this" }, { status: 403 });
      await db.delete(liveRoomBoardCards).where(eq(liveRoomBoardCards.id, cardId));
    } else if (action === "move-card") {
      await db.update(liveRoomBoardCards).set({
        x: clampCoord(body.x, card.x),
        y: clampCoord(body.y, card.y),
        width: clampSize(body.width, card.width),
        height: clampSize(body.height, card.height),
        updatedAt: new Date().toISOString(),
      }).where(eq(liveRoomBoardCards.id, cardId));
    } else {
      if (!mayMutate) return Response.json({ error: "Only the author or facilitator can edit this" }, { status: 403 });
      const color = CARD_COLORS.includes(String(body.color) as never) ? String(body.color) : card.color;
      await db.update(liveRoomBoardCards).set({
        body: body.body === undefined ? card.body : String(body.body).slice(0, 2000),
        color,
        updatedAt: new Date().toISOString(),
      }).where(eq(liveRoomBoardCards.id, cardId));
    }
  } else if (action === "connect" || action === "disconnect") {
    const targetId = String(body.targetId ?? "");
    const sourceCardId = String(body.sourceCardId ?? "");
    const [target] = await db.select().from(liveRoomBoardCards)
      .where(and(eq(liveRoomBoardCards.id, targetId), eq(liveRoomBoardCards.roomId, room.id))).limit(1);
    if (!target) return Response.json({ error: "Target object not found" }, { status: 404 });
    if (target.kind !== "prompt" && target.kind !== "workflow") {
      return Response.json({ error: "Only prompt and workflow cards accept inputs" }, { status: 400 });
    }
    if (sourceCardId === targetId) return Response.json({ error: "An object cannot feed itself" }, { status: 400 });
    const payload = parsePayload(target.payload);
    const current = asStringArray(payload.inputs);
    const next = action === "connect"
      ? [...new Set([...current, sourceCardId])].slice(0, 12)
      : current.filter((id) => id !== sourceCardId);
    await db.update(liveRoomBoardCards)
      .set({ payload: JSON.stringify({ ...payload, inputs: next }), updatedAt: new Date().toISOString() })
      .where(eq(liveRoomBoardCards.id, targetId));
  } else if (action === "run-card" || action === "run-chain") {
    // Live runs spend tokens against the class model, so the facilitator owns them.
    if (!access.facilitator) return Response.json({ error: "Only the facilitator can run the class model" }, { status: 403 });

    const startId = String(body.cardId ?? "");
    const all = await db.select().from(liveRoomBoardCards).where(eq(liveRoomBoardCards.roomId, room.id));
    const byId = new Map(all.map((card) => [card.id, card]));
    const start = byId.get(startId);
    if (!start || (start.kind !== "prompt" && start.kind !== "workflow")) {
      return Response.json({ error: "Select a prompt or workflow card to run" }, { status: 400 });
    }

    const policy = await activePolicy();
    const provider = body.provider ?? "gemini";
    if (!isModelProvider(provider)) {
      return Response.json({ error: "Unsupported model provider" }, { status: 400 });
    }
    if (!permitsProvider(policy, provider)) {
      return Response.json({ error: `${provider} is not approved by the active governance policy` }, { status: 403 });
    }
    if (!getProviderStatuses().some((status) => status.provider === provider && status.configured)) {
      return Response.json({ error: `${provider} has no API key configured on this server` }, { status: 400 });
    }

    const steps = action === "run-chain" ? chainOrder(startId, byId) : [start];
    if (!steps.length) return Response.json({ error: "Nothing to run" }, { status: 400 });

    // A chain is one provider call per step, charged to whoever ran it.
    try {
      await assertModelBudget(identity.email, steps.length);
    } catch (error) {
      if (error instanceof ModelBudgetError) return budgetErrorResponse(error);
      throw error;
    }

    const produced: Record<string, string> = {};
    let blockedAny: string[] = [];

    try {
      for (const [index, step] of steps.entries()) {
        const { sourceIds, priorText } = gatherInputs(step, byId);
        const resolved = resolveSourceText(room.currentLabId, sourceIds, policy);
        blockedAny = [...new Set([...blockedAny, ...resolved.blocked])];

        // Feed the preceding step's output into this one when running a chain.
        const upstream = inputsOf(step)
          .map((id) => produced[id])
          .filter(Boolean)
          .join("\n\n");
        const context = [resolved.text, ...priorText, upstream].filter(Boolean).join("\n\n---\n\n");

        const result = await executeModelProvider(provider, {
          attemptId: room.id,
          labId: room.currentLabId,
          prompt: step.body,
          sourceText: context,
          maxOutputTokens: 700,
        });
        const cost = estimateModelCost(provider, result.model, result.usage);
        await recordModelUsage({ ownerEmail: identity.email, purpose: "live-room", provider, model: result.model, usage: result.usage, cost });
        produced[step.id] = result.outputText;

        const [outputCard] = await db.insert(liveRoomBoardCards).values({
          id: crypto.randomUUID(),
          roomId: room.id,
          sectionKey: room.currentLabId,
          authorEmail: identity.email,
          body: result.outputText,
          color: "blue",
          kind: "output",
          x: step.x,
          y: step.y + step.height + 28 + index * 8,
          width: Math.max(320, step.width),
          height: 220,
          payload: JSON.stringify({
            inputs: [step.id],
            provider,
            model: result.model,
            usage: result.usage,
            cost,
            sourceIds: resolved.used,
            blockedSourceIds: resolved.blocked,
          }),
        }).returning();
        byId.set(outputCard.id, outputCard);
      }

      await recordAudit(identity.email, "live-room.model-run", "cohort-session", sessionId, {
        cards: steps.length,
        provider,
        blockedSourceIds: blockedAny,
      });
    } catch (error) {
      if (error instanceof ProviderError) return Response.json({ code: error.code, error: error.message }, { status: error.status });
      return serverErrorResponse("live-room.model-run", error, "The model run could not be completed.");
    }
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

  await notifyLiveRoom(sessionId, action);
  const view = await roomView(sessionId, identity);
  return Response.json({ identity, ...view }, { status: action === "open-room" ? 201 : 200 });
}
