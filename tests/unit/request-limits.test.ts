import { describe, expect, it } from "vitest";
import {
  boundedAttemptPayload,
  boundedText,
  clampInteger,
  MAX_DRAFT_FIELDS,
  MAX_FIELD_CHARS,
  MAX_PROMPT_CHARS,
  MAX_SELECTED_SOURCES,
  readJsonBody,
} from "../../app/lib/request-limits";

const postWith = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://labs.example.com/api/attempts", { method: "POST", body, headers });

describe("readJsonBody", () => {
  it("parses an object body", async () => {
    const result = await readJsonBody<{ action: string }>(postWith(JSON.stringify({ action: "start" })));
    expect(result.ok && result.body.action).toBe("start");
  });

  it("refuses a body over the ceiling before parsing it", async () => {
    const result = await readJsonBody(postWith(JSON.stringify({ filler: "x".repeat(2_000) })), 500);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("trusts a declared content-length to refuse early", async () => {
    // A client claiming a huge body is refused without the body being read.
    const result = await readJsonBody(postWith("{}", { "content-length": "999999999" }), 1_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("turns malformed JSON into a client error, not a thrown 500", async () => {
    const result = await readJsonBody(postWith("{ not json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("refuses a non-object body, which no handler is written to accept", async () => {
    for (const body of ["[1,2,3]", '"a string"', "null"]) {
      const result = await readJsonBody(postWith(body));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(400);
    }
  });

  it("treats an empty body as an empty object", async () => {
    const result = await readJsonBody(postWith(""));
    expect(result.ok).toBe(true);
  });
});

describe("boundedText", () => {
  it("truncates rather than rejecting", () => {
    expect(boundedText("x".repeat(50), 10)).toHaveLength(10);
  });

  it("coerces absent values to an empty string", () => {
    expect(boundedText(undefined)).toBe("");
    expect(boundedText(null)).toBe("");
  });
});

describe("clampInteger", () => {
  it("holds a value inside its range", () => {
    expect(clampInteger(9_000, 0, 1500, 0)).toBe(1500);
    expect(clampInteger(-5, 0, 1500, 0)).toBe(0);
    expect(clampInteger(42.6, 0, 1500, 0)).toBe(43);
  });

  it("falls back when the value cannot be a number", () => {
    // A NaN reaching an INTEGER column is a 500 at the database, not a value.
    expect(clampInteger("not a number", 0, 1500, 0)).toBe(0);
    expect(clampInteger(Infinity, 0, 1500, 0)).toBe(0);
    expect(clampInteger(undefined, 0, 1500, 0)).toBe(0);
  });
});

describe("boundedAttemptPayload", () => {
  it("bounds every client-controlled field", () => {
    const bounded = boundedAttemptPayload({
      draft: Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`field-${index}`, "y".repeat(MAX_FIELD_CHARS + 100)])),
      prompt: "p".repeat(MAX_PROMPT_CHARS + 100),
      selectedSources: Array.from({ length: 100 }, (_, index) => `src-${index}`),
      verification: "v".repeat(MAX_FIELD_CHARS + 100),
      secondsRemaining: 10_000,
    });

    expect(Object.keys(bounded.draft)).toHaveLength(MAX_DRAFT_FIELDS);
    expect(Object.values(bounded.draft).every((value) => value.length === MAX_FIELD_CHARS)).toBe(true);
    expect(bounded.prompt).toHaveLength(MAX_PROMPT_CHARS);
    expect(bounded.selectedSources).toHaveLength(MAX_SELECTED_SOURCES);
    expect(bounded.verification).toHaveLength(MAX_FIELD_CHARS);
    expect(bounded.secondsRemaining).toBe(1500);
  });

  it("leaves an ordinary payload untouched", () => {
    const payload = {
      draft: { ragStatus: "Amber", statusRationale: "NW-PLAN-08 conflict" },
      prompt: "Cite source IDs and use Unknown where evidence is missing.",
      selectedSources: ["NW-PLAN-08"],
      verification: "Verified sources.",
      secondsRemaining: 900,
    };
    expect(boundedAttemptPayload(payload)).toEqual(payload);
  });

  it("survives a payload with nothing in it", () => {
    expect(boundedAttemptPayload({})).toEqual({
      draft: {}, prompt: "", selectedSources: [], verification: "", secondsRemaining: 0,
    });
  });
});
