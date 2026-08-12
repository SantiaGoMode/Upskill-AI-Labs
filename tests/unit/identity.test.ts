import { describe, expect, it } from "vitest";
import {
  headerIdentityIsTrusted,
  PROXY_SECRET_HEADER,
  readHeaderIdentity,
  secretsMatch,
} from "../../app/lib/identity-trust";
import { createSessionToken, readSessionToken } from "../../app/lib/session-token";
import { publicDemoIdentity } from "../../app/lib/request-identity";

const identityHeaders = (extra: Record<string, string> = {}) => new Headers({
  "oai-authenticated-user-email": "Learner@Example.com",
  "oai-authenticated-user-role": "facilitator",
  ...extra,
});

describe("upstream identity trust", () => {
  it("rejects identity headers on a deployment with no configured proxy secret", () => {
    // The dangerous case: a public hostname where anyone could claim facilitator.
    expect(headerIdentityIsTrusted("", { proxySecret: "", managed: true, local: false })).toBe(false);
    expect(readHeaderIdentity(identityHeaders(), { proxySecret: "", managed: true, local: false })).toBeNull();
  });

  it("requires the shared secret once one is configured, even on localhost", () => {
    const context = { proxySecret: "expected-secret", managed: false, local: true };
    expect(readHeaderIdentity(identityHeaders(), context)).toBeNull();
    expect(readHeaderIdentity(identityHeaders({ [PROXY_SECRET_HEADER]: "wrong" }), context)).toBeNull();
    expect(readHeaderIdentity(identityHeaders({ [PROXY_SECRET_HEADER]: "expected-secret" }), context)?.role)
      .toBe("facilitator");
  });

  it("trusts a proxy that presents the secret on any hostname", () => {
    const identity = readHeaderIdentity(identityHeaders({ [PROXY_SECRET_HEADER]: "s3cret" }), {
      proxySecret: "s3cret",
      managed: true,
      local: false,
    });
    expect(identity).toEqual({
      email: "learner@example.com",
      displayName: "learner@example.com",
      source: "trusted-header",
      role: "facilitator",
    });
  });

  it("keeps header identities usable in a local checkout with no secret configured", () => {
    const identity = readHeaderIdentity(identityHeaders({ "oai-authenticated-user-role": "learner" }), {
      proxySecret: "",
      managed: false,
      local: true,
    });
    expect(identity?.email).toBe("learner@example.com");
    expect(identity?.role).toBe("learner");
  });

  it("defaults to the learner role and decodes an encoded display name", () => {
    const identity = readHeaderIdentity(identityHeaders({
      "oai-authenticated-user-role": "administrator",
      "oai-authenticated-user-full-name": "Ren%C3%A9e%20Diaz",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    }), { proxySecret: "", managed: false, local: true });
    expect(identity?.role).toBe("learner");
    expect(identity?.displayName).toBe("Renée Diaz");
  });

  it("compares secrets without short-circuiting on content", () => {
    expect(secretsMatch("abcdef", "abcdef")).toBe(true);
    expect(secretsMatch("abcdef", "abcdeg")).toBe(false);
    expect(secretsMatch("abc", "abcdef")).toBe(false);
    expect(secretsMatch("", "")).toBe(true);
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
