/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { ensureLabSchema } from "../db/runtime";
import { isCrossSiteWrite } from "../app/lib/cross-site";
import { liveRoomAccess } from "../app/lib/live-room-access";
import { getRequestIdentity } from "../app/lib/request-identity";
import { purgeExpiredPromptData } from "../app/lib/retention";

export { LiveRoomSocket } from "./live-room-socket";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  LIVE_ROOM: DurableObjectNamespace;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

/**
 * Content Security Policy.
 *
 * `connect-src 'self'` is the load-bearing rule here: model providers are called
 * from the server, so the browser never needs to reach a third-party origin, and
 * anything that tried to exfiltrate learner work to one would be blocked. Fonts
 * are self-hosted by the build, so no external origins are allowed at all.
 *
 * `script-src` needs 'unsafe-inline' and cannot currently be tightened. The framework
 * emits its RSC payload as inline `self.__VINEXT_RSC_CHUNKS__.push(...)` scripts whose
 * content differs on every render, so hashes are not an option, and vinext has no way
 * to stamp a nonce onto them. Browsers ignore 'unsafe-inline' as soon as any nonce or
 * hash is present, so this is all-or-nothing: adding one for our own theme bootstrap
 * would break every framework script. Revisit when vinext supports nonces.
 *
 * The residual risk is bounded: the app's only `dangerouslySetInnerHTML` is that
 * theme script with a static internal string, so no user-supplied value reaches an
 * HTML sink, and everything else is escaped by React.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Same-origin API and the Live Room socket only; providers are called server-side.
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

function withSecurityHeaders(response: Response, url: URL): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (url.protocol === "https:") {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Authorizes a Live Room WebSocket before handing it to the session's channel.
 *
 * The upgrade is authenticated here rather than in a route handler because a 101
 * response carries a `webSocket` that would be lost by rebuilding the Response.
 * Access uses the same check as the REST route, so a socket cannot reach a session
 * the caller could not already read.
 */
async function handleLiveRoomSocket(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }

  const sessionId = url.searchParams.get("sessionId") ?? "";
  if (!sessionId) return new Response("sessionId is required", { status: 400 });

  // Without the binding the room still works: the client falls back to polling.
  if (!env.LIVE_ROOM) return new Response("The live channel is unavailable", { status: 503 });

  await ensureLabSchema();
  const identity = await getRequestIdentity(request);
  if (!identity) return new Response("Authentication is required", { status: 401 });

  const access = await liveRoomAccess(sessionId, identity);
  if (!access) return new Response("Live session not found", { status: 404 });

  const channel = env.LIVE_ROOM.get(env.LIVE_ROOM.idFromName(sessionId));
  return channel.fetch(new Request("https://live-room/connect", request));
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (isCrossSiteWrite(request.method, request.headers.get("origin"), url.host)) {
      return withSecurityHeaders(
        Response.json({ error: "Cross-site requests are not accepted" }, { status: 403 }),
        url,
      );
    }

    // Returned unwrapped: a 101 upgrade cannot survive being copied.
    if (url.pathname === "/api/live-room/socket") {
      return handleLiveRoomSocket(request, env, url);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const optimized = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(optimized, url);
    }

    return withSecurityHeaders(await handler.fetch(request, env, ctx), url);
  },

  /**
   * Nightly retention purge. The schedule lives in wrangler.jsonc; how far back to
   * delete comes from the active governance policy, so changing the policy changes
   * what this removes without a redeploy.
   */
  async scheduled(_controller: ScheduledController, _env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      purgeExpiredPromptData().catch((error: unknown) => {
        console.error(JSON.stringify({
          level: "error",
          message: "retention_purge_failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        }));
      }),
    );
  },
};

export default worker;
