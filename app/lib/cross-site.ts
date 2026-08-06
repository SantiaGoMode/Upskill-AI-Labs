/**
 * Cross-site request forgery decision for state-changing requests.
 *
 * The session cookie is `SameSite=Lax`, so a browser will not attach it to a
 * cross-site POST — this is the second lock, not the first. It earns its place
 * because the cookie is not the only way a request is identified: a deployment
 * behind the authenticating proxy is identified by headers, where a cookie
 * policy protects nothing at all.
 *
 * Deliberately free of runtime bindings so the decision can be unit tested
 * directly, the same reason `identity-trust.ts` is.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * True when a request should be refused as cross-site.
 *
 * A browser always sends `Origin` on a state-changing request, so a mismatched
 * one is refused. A *missing* Origin is allowed through: that is a non-browser
 * client — the API test suite, an uptime probe, a server-to-server call — and
 * not something a victim's browser can be tricked into sending.
 */
export function isCrossSiteWrite(method: string, origin: string | null, host: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  // "null" is what a sandboxed or redirected context sends; it matches no host.
  if (!origin) return false;
  if (origin === "null") return true;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
