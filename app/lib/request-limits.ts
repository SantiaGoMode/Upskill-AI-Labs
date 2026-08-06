/**
 * Bounds on what a request may carry.
 *
 * Every field a client controls that is persisted, or forwarded to a paid model
 * provider, needs a ceiling. Without one, an authenticated learner can fill D1
 * with a single write or spend an account's whole daily model budget in one call:
 * the budget check refuses the *next* call after the cap is passed, so the size of
 * any individual call has to be bounded here instead.
 *
 * These are deliberately generous — far above any legitimate use — because their
 * job is to make abuse bounded, not to police normal work.
 */

/**
 * Whole-body ceiling, applied before parsing. Comfortably fits the largest
 * legitimate payload (a lab draft with every field filled, or a curriculum
 * version's content tree) and nothing near a memory problem for an isolate.
 */
export const MAX_JSON_BODY_CHARS = 256_000;

/** Learner-authored prompt sent to a provider. */
export const MAX_PROMPT_CHARS = 8_000;

/** One deliverable field, a verification note, or a rationale. */
export const MAX_FIELD_CHARS = 8_000;

/** Fields in a single lab draft. Every lab defines fewer than a dozen. */
export const MAX_DRAFT_FIELDS = 40;

/** Sources a single run may pull in. Every lab ships fewer than this. */
export const MAX_SELECTED_SOURCES = 24;

/** Objects one Live Room whiteboard may hold before it stops accepting more. */
export const MAX_CARDS_PER_ROOM = 500;

/** Serialized size of an opaque JSON blob stored verbatim (curriculum content). */
export const MAX_STORED_JSON_CHARS = 200_000;

export type JsonBody<T> = { ok: true; body: T } | { ok: false; response: Response };

/**
 * Reads and parses a JSON request body, refusing anything oversized or malformed
 * with a 413 or 400 rather than letting it reach a handler — or, for the routes
 * with no try/catch of their own, letting a syntax error surface as a 500.
 *
 * Returns a result rather than throwing so a caller can `return parsed.response`
 * without wrapping every handler in exception plumbing.
 */
export async function readJsonBody<T>(
  request: Request,
  maxChars = MAX_JSON_BODY_CHARS,
): Promise<JsonBody<T>> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxChars) return { ok: false, response: tooLarge() };

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: Response.json({ error: "The request body could not be read" }, { status: 400 }) };
  }

  // A chunked body carries no content-length, so its real size is only known here.
  if (text.length > maxChars) return { ok: false, response: tooLarge() };

  try {
    const parsed = JSON.parse(text || "{}") as T;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, response: Response.json({ error: "A JSON object body is required" }, { status: 400 }) };
    }
    return { ok: true, body: parsed };
  } catch {
    return { ok: false, response: Response.json({ error: "The request body is not valid JSON" }, { status: 400 }) };
  }
}

function tooLarge() {
  return Response.json({ error: "The request body is too large" }, { status: 413 });
}

/** Coerces to a string and truncates. Anything absent becomes an empty string. */
export const boundedText = (value: unknown, maxChars = MAX_FIELD_CHARS) =>
  String(value ?? "").slice(0, maxChars);

/** Coerces to an integer inside a range, falling back when the value is unusable. */
export function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

/**
 * Bounds a client-supplied attempt payload before it is persisted or graded.
 * Unknown draft fields are kept — each lab defines its own field ids — but their
 * count and size are not left to the client.
 */
export function boundedAttemptPayload(payload: {
  draft?: Record<string, unknown>;
  prompt?: unknown;
  selectedSources?: unknown;
  verification?: unknown;
  secondsRemaining?: unknown;
}) {
  const draftEntries = Object.entries(payload.draft ?? {}).slice(0, MAX_DRAFT_FIELDS);
  return {
    draft: Object.fromEntries(draftEntries.map(([key, value]) => [
      key.slice(0, 120),
      boundedText(value, MAX_FIELD_CHARS),
    ])),
    prompt: boundedText(payload.prompt, MAX_PROMPT_CHARS),
    selectedSources: (Array.isArray(payload.selectedSources) ? payload.selectedSources : [])
      .slice(0, MAX_SELECTED_SOURCES)
      .map((source) => boundedText(source, 120)),
    verification: boundedText(payload.verification, MAX_FIELD_CHARS),
    secondsRemaining: clampInteger(payload.secondsRemaining, 0, 1500, 0),
  };
}
