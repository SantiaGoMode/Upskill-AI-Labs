import { ensureLabSchema } from "../../../db/runtime";
import { serverErrorResponse } from "../../lib/observability";
import { readJsonBody } from "../../lib/request-limits";
import { getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";
import { deleteLearnerData, exportLearnerData } from "../../lib/retention";

/**
 * Data-subject requests. Both operations act only on the authenticated caller's
 * own records: there is no path here to read or erase another learner's data.
 */

/** `GET /api/account?action=export` returns everything held for the caller. */
export async function GET(request: Request) {
  try {
    await ensureLabSchema();
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorizedResponse();

    if (new URL(request.url).searchParams.get("action") !== "export") {
      return Response.json({ error: "Unsupported action" }, { status: 400 });
    }

    const data = await exportLearnerData(identity.email);
    const filename = `upskill-ai-labs-${identity.email.replace(/[^a-z0-9]+/gi, "-")}.json`;
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return serverErrorResponse("account.export", error, "Your data export could not be produced.");
  }
}

/**
 * `POST /api/account` with `{ action: "delete", confirmEmail }` erases the caller's
 * records. The confirmation must match the signed-in address, so a mistaken or
 * forged request cannot delete an account by accident.
 */
export async function POST(request: Request) {
  try {
    await ensureLabSchema();
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorizedResponse();

    const parsed = await readJsonBody<{ action?: string; confirmEmail?: string }>(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    if (body.action !== "delete") return Response.json({ error: "Unsupported action" }, { status: 400 });

    if (body.confirmEmail?.trim().toLowerCase() !== identity.email) {
      return Response.json(
        { error: "Type your own email address to confirm erasure" },
        { status: 400 },
      );
    }

    const deleted = await deleteLearnerData(identity.email);
    return Response.json({
      deleted,
      note: "Learner records were erased. A single audit event recording this erasure is retained.",
    });
  } catch (error) {
    return serverErrorResponse("account.delete", error, "Your data could not be erased.");
  }
}
