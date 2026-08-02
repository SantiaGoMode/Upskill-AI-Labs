import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { evalResults, labAttempts, labSubmissions } from "../../../db/schema";
import type { AttemptPayload, PersistedAttempt } from "../../lib/attempt-types";
import { evaluateCurriculumLab, evaluateLabOne } from "../../lib/evaluator";
import { getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toAttempt(row: typeof labAttempts.$inferSelect): PersistedAttempt {
  return {
    id: row.id,
    ownerEmail: row.ownerEmail,
    labId: row.labId,
    status: row.status === "submitted" ? "submitted" : "in_progress",
    draft: parseJson(row.draftJson, {}) as AttemptPayload["draft"],
    prompt: row.prompt,
    selectedSources: parseJson(row.selectedSourcesJson, []),
    verification: row.verification,
    secondsRemaining: row.secondsRemaining,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected attempt storage error";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await ensureLabSchema();
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorizedResponse();
    const searchParams = new URL(request.url).searchParams;
    if (searchParams.get("history") === "1") {
      const rows = await getDb().select().from(labAttempts)
        .where(eq(labAttempts.ownerEmail, identity.email))
        .orderBy(desc(labAttempts.updatedAt));
      return Response.json({
        identity,
        attempts: rows.map(toAttempt),
      });
    }
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const db = getDb();
    const [row] = await db.select().from(labAttempts)
      .where(and(eq(labAttempts.id, id), eq(labAttempts.ownerEmail, identity.email))).limit(1);
    if (!row) return Response.json({ error: "Attempt not found" }, { status: 404 });
    const [latestEvaluation] = await db
      .select({ submissionId: labSubmissions.id, resultJson: evalResults.resultJson })
      .from(labSubmissions)
      .innerJoin(evalResults, eq(evalResults.submissionId, labSubmissions.id))
      .where(eq(labSubmissions.attemptId, id))
      .orderBy(desc(labSubmissions.submittedAt))
      .limit(1);
    return Response.json({
      attempt: toAttempt(row),
      evaluation: latestEvaluation ? parseJson(latestEvaluation.resultJson, null) : null,
      submissionId: latestEvaluation?.submissionId ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureLabSchema();
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorizedResponse();
    const body = (await request.json()) as {
      action?: "start" | "save" | "submit";
      id?: string;
      labId?: string;
      payload?: AttemptPayload;
    };

    if (body.action === "start") {
      const id = crypto.randomUUID();
      const labId = body.labId?.trim() || "lab-01";
      const [row] = await getDb().insert(labAttempts).values({ id, labId, ownerEmail: identity.email }).returning();
      return Response.json({ attempt: toAttempt(row) }, { status: 201 });
    }

    if (body.action === "save") {
      if (!body.id || !body.payload) {
        return Response.json({ error: "id and payload are required" }, { status: 400 });
      }

      const payload = body.payload;
      const [row] = await getDb()
        .update(labAttempts)
        .set({
          draftJson: JSON.stringify(payload.draft),
          prompt: payload.prompt,
          selectedSourcesJson: JSON.stringify(payload.selectedSources),
          verification: payload.verification,
          secondsRemaining: Math.max(0, Math.min(1500, Math.round(payload.secondsRemaining))),
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(labAttempts.id, body.id), eq(labAttempts.ownerEmail, identity.email)))
        .returning();

      if (!row) return Response.json({ error: "Attempt not found" }, { status: 404 });
      return Response.json({ attempt: toAttempt(row) });
    }

    if (body.action === "submit") {
      if (!body.id || !body.payload) {
        return Response.json({ error: "id and payload are required" }, { status: 400 });
      }

      const db = getDb();
      const [attempt] = await db.select().from(labAttempts)
        .where(and(eq(labAttempts.id, body.id), eq(labAttempts.ownerEmail, identity.email))).limit(1);
      if (!attempt) return Response.json({ error: "Attempt not found" }, { status: 404 });

      const result = attempt.labId === "lab-01"
        ? evaluateLabOne(body.payload)
        : evaluateCurriculumLab(attempt.labId, body.payload);
      const submissionId = crypto.randomUUID();
      await db.insert(labSubmissions).values({
        id: submissionId,
        attemptId: body.id,
        payloadJson: JSON.stringify(body.payload),
      });
      await db.insert(evalResults).values({
        id: crypto.randomUUID(),
        submissionId,
        evaluatorVersion: result.version,
        resultJson: JSON.stringify(result),
        passed: result.passed,
      });
      await db.update(labAttempts).set({
        status: "submitted",
        draftJson: JSON.stringify(body.payload.draft),
        prompt: body.payload.prompt,
        selectedSourcesJson: JSON.stringify(body.payload.selectedSources),
        verification: body.payload.verification,
        secondsRemaining: body.payload.secondsRemaining,
        updatedAt: new Date().toISOString(),
      }).where(and(eq(labAttempts.id, body.id), eq(labAttempts.ownerEmail, identity.email)));

      return Response.json({ submissionId, result }, { status: 201 });
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
