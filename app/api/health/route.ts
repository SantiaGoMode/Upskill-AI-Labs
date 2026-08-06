import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { logWarning } from "../../lib/observability";
import { isManagedEnvironment } from "../../lib/runtime-env";

/**
 * Unauthenticated liveness and readiness probe for a load balancer or uptime
 * check. It reports whether the database answers and whether the secrets a
 * deployment needs are present, without revealing their values.
 */
export async function GET() {
  const checks: Record<string, "ok" | "unavailable" | "missing"> = {};

  try {
    await getDb().run(sql`select 1`);
    checks.database = "ok";
  } catch (error) {
    checks.database = "unavailable";
    logWarning("health_database_unavailable", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  const managed = isManagedEnvironment();
  // Both are required for a deployment to authenticate anyone at all.
  checks.identity = !managed || env.TRUSTED_PROXY_SECRET?.trim() ? "ok" : "missing";
  checks.sessions = !managed || env.SESSION_SECRET?.trim() ? "ok" : "missing";

  const healthy = Object.values(checks).every((value) => value === "ok");
  return Response.json(
    { status: healthy ? "ok" : "degraded", environment: env.ENVIRONMENT ?? "development", checks },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
