/**
 * Server-side logging and error responses.
 *
 * Logs are single-line JSON so the managed log stream stays queryable, and they
 * never carry learner prompt text, artifact content, or source material: an
 * operator debugging a failure should not thereby read a learner's work. Every
 * failed request gets an incident id that appears both in the log line and in the
 * response, so a learner can quote it and an operator can find it.
 */

export type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: "info" | "warn" | "error", message: string, fields: LogFields) {
  const entry: LogFields & { level: string; message: string } = { level, message };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) entry[key] = value;
  }
  // App Hosting captures stdout/stderr for each server request.
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logInfo = (message: string, fields: LogFields = {}) => emit("info", message, fields);
export const logWarning = (message: string, fields: LogFields = {}) => emit("warn", message, fields);

export const newIncidentId = () => crypto.randomUUID().slice(0, 8);

/** Describes a thrown value without leaking a stack trace to the client. */
function describe(error: unknown) {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message, stack: error.stack?.slice(0, 2000) };
  }
  return { errorName: "NonError", errorMessage: String(error), stack: undefined };
}

/**
 * Logs an unexpected failure and returns the response to send. The client is told
 * only that the request failed, plus the incident id; the detail stays in the log.
 */
export function serverErrorResponse(route: string, error: unknown, publicMessage: string) {
  const incidentId = newIncidentId();
  const { errorName, errorMessage, stack } = describe(error);
  emit("error", "request_failed", { route, incidentId, errorName, errorMessage, stack });
  return Response.json({ error: publicMessage, incidentId }, { status: 500 });
}

/** Logs a handled, expected refusal. Useful for spotting misconfiguration early. */
export function logRefusal(route: string, reason: string, fields: LogFields = {}) {
  emit("warn", "request_refused", { route, reason, ...fields });
}
