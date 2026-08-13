import { describe, expect, it } from "vitest";
import { readLocalHeaderIdentity } from "../../app/lib/identity-trust";
import { createSessionToken, readSessionToken } from "../../app/lib/session-token";
import { publicDemoIdentity } from "../../app/lib/request-identity";

const identityHeaders = (extra: Record<string, string> = {}) => new Headers({
  "oai-authenticated-user-email": "Learner@Example.com",
  "oai-authenticated-user-role": "facilitator",
  ...extra,
});

describe("local header identities", () => {
  it("rejects identity headers unless the caller explicitly allows local test identities", () => {
    expect(readLocalHeaderIdentity(identityHeaders(), false)).toBeNull();
  });

  it("keeps header identities usable by the local test harness", () => {
    const identity = readLocalHeaderIdentity(identityHeaders({ "oai-authenticated-user-role": "learner" }), true);
    expect(identity?.email).toBe("learner@example.com");
    expect(identity?.role).toBe("learner");
    expect(identity?.source).toBe("local-header");
  });

  it("defaults to the learner role and decodes an encoded display name", () => {
    const identity = readLocalHeaderIdentity(identityHeaders({
      "oai-authenticated-user-role": "administrator",
      "oai-authenticated-user-full-name": "Ren%C3%A9e%20Diaz",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    }), true);
    expect(identity?.role).toBe("learner");
    expect(identity?.displayName).toBe("Renée Diaz");
  });
});

describe("public demo identity", () => {
  it("exists only for safe requests in a managed environment", () => {
    const view = publicDemoIdentity(new Request("https://demo.example/course", { method: "GET" }), true);
    expect(view).toEqual({
      email: "public-demo@upskill.invalid",
      displayName: "Demo visitor",
      source: "public-demo",
      role: "viewer",
    });
    expect(publicDemoIdentity(new Request("https://demo.example/api/attempts", { method: "POST" }), true)).toBeNull();
    expect(publicDemoIdentity(new Request("http://localhost:3000/course", { method: "GET" }), false)).toBeNull();
  });
});

describe("session cookies", () => {
  const sessionId = "3f6c1d54-0f2f-4a1f-9a1b-77b0d3a6e111";

  it("round-trips a signed token", async () => {
    const token = await createSessionToken(sessionId, "signing-secret");
    expect(token).not.toBe(sessionId);
    expect(await readSessionToken(token, "signing-secret")).toBe(sessionId);
  });

  it("rejects a tampered payload, a bad signature, and the wrong secret", async () => {
    const token = await createSessionToken(sessionId, "signing-secret");
    const [id, mac] = token.split(".");
    expect(await readSessionToken(`${id.slice(0, -1)}0.${mac}`, "signing-secret")).toBeNull();
    expect(await readSessionToken(`${id}.${mac.slice(0, -1)}x`, "signing-secret")).toBeNull();
    expect(await readSessionToken(token, "another-secret")).toBeNull();
  });

  it("rejects an unsigned cookie once a secret is configured", async () => {
    expect(await readSessionToken(sessionId, "signing-secret")).toBeNull();
  });

  it("rejects a signed cookie after the secret is removed", async () => {
    const token = await createSessionToken(sessionId, "signing-secret");
    expect(await readSessionToken(token, "")).toBeNull();
  });

  it("allows bare ids only when no secret is configured", async () => {
    expect(await createSessionToken(sessionId, "")).toBe(sessionId);
    expect(await readSessionToken(sessionId, "")).toBe(sessionId);
    expect(await readSessionToken("", "")).toBeNull();
  });
});
