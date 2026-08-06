/**
 * Account session cookies.
 *
 * The cookie carries an opaque session id that is looked up server-side, plus an
 * HMAC so a forged or truncated cookie is rejected before it reaches the
 * database. Signing is required in a deployed environment; a local checkout with
 * no `SESSION_SECRET` keeps working with bare ids.
 */

const encoder = new TextEncoder();

function base64Url(bytes: ArrayBuffer) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function signature(sessionId: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(sessionId)));
}

/** Builds the cookie value for a freshly created session. */
export async function createSessionToken(sessionId: string, secret: string) {
  if (!secret) return sessionId;
  return `${sessionId}.${await signature(sessionId, secret)}`;
}

/**
 * Returns the session id carried by a cookie, or null when the cookie is
 * malformed or its signature does not verify.
 */
export async function readSessionToken(value: string, secret: string): Promise<string | null> {
  const token = value.trim();
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (!secret) {
    // Unsigned local session. A dotted token means the cookie was issued while a
    // secret was configured, so it is no longer verifiable and must be rejected.
    return separator === -1 ? token : null;
  }

  if (separator <= 0) return null;
  const sessionId = token.slice(0, separator);
  const presented = token.slice(separator + 1);
  const expected = await signature(sessionId, secret);
  if (presented.length !== expected.length) return null;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= presented.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0 ? sessionId : null;
}
