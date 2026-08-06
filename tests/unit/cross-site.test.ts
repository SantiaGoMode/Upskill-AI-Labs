import { describe, expect, it } from "vitest";
import { isCrossSiteWrite } from "../../app/lib/cross-site";

const HOST = "labs.example.com";

describe("isCrossSiteWrite", () => {
  it("allows same-origin writes", () => {
    expect(isCrossSiteWrite("POST", `https://${HOST}`, HOST)).toBe(false);
    // The scheme is not part of the comparison; a proxy may terminate TLS.
    expect(isCrossSiteWrite("POST", `http://${HOST}`, HOST)).toBe(false);
  });

  it("refuses a write from another origin", () => {
    expect(isCrossSiteWrite("POST", "https://attacker.example", HOST)).toBe(true);
    expect(isCrossSiteWrite("DELETE", "https://attacker.example", HOST)).toBe(true);
    // A lookalike host, and a subdomain, are both other origins.
    expect(isCrossSiteWrite("POST", `https://${HOST}.attacker.example`, HOST)).toBe(true);
    expect(isCrossSiteWrite("POST", `https://evil.${HOST}`, HOST)).toBe(true);
  });

  it("distinguishes a port, because a different port is a different origin", () => {
    expect(isCrossSiteWrite("POST", `https://${HOST}:8443`, HOST)).toBe(true);
    expect(isCrossSiteWrite("POST", `https://${HOST}:8443`, `${HOST}:8443`)).toBe(false);
  });

  it("never refuses a read, whatever origin sent it", () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "get", "head"]) {
      expect(isCrossSiteWrite(method, "https://attacker.example", HOST)).toBe(false);
    }
  });

  it("allows a request with no Origin, which no browser omits on a write", () => {
    // Non-browser callers: the API suite, an uptime probe, a server-to-server
    // call. None of these is a request a victim's browser can be made to send.
    expect(isCrossSiteWrite("POST", null, HOST)).toBe(false);
  });

  it("refuses an opaque or unparseable origin", () => {
    expect(isCrossSiteWrite("POST", "null", HOST)).toBe(true);
    expect(isCrossSiteWrite("POST", "not a url", HOST)).toBe(true);
  });
});
