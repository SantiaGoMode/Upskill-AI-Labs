import { and, desc, eq } from "../../../db/firestore-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { lessonProgress } from "../../../db/schema";
import { lessonById } from "../../content/course";
import { serverErrorResponse } from "../../lib/observability";
import { readJsonBody } from "../../lib/request-limits";
import { getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";
import { demoLessonProgress, isDemoViewer } from "../../lib/demo-record";

/** Course progress. Reading lessons record completion; checks also record a score. */

export async function GET(request: Request) {
  const identity = await getRequestIdentity(request);
  if (!identity) return unauthorizedResponse();
  if (isDemoViewer(identity)) return Response.json({ progress: demoLessonProgress });
  await ensureLabSchema();

  const rows = await getDb()
    .select()
    .from(lessonProgress)
    .where(eq(lessonProgress.ownerEmail, identity.email))
    .orderBy(desc(lessonProgress.updatedAt));

  return Response.json({ progress: rows });
}

export async function POST(request: Request) {
  try {
    await ensureLabSchema();
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorizedResponse();

    const parsed = await readJsonBody<{
      action?: "complete" | "reset";
      moduleId?: string;
      lessonId?: string;
      score?: number;
    }>(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;

    const moduleId = String(body.moduleId ?? "");
    const lessonId = String(body.lessonId ?? "");
    const lesson = lessonById(moduleId, lessonId);
    if (!lesson) return Response.json({ error: "Unknown lesson" }, { status: 404 });

    const db = getDb();
    const owned = and(eq(lessonProgress.ownerEmail, identity.email), eq(lessonProgress.lessonId, lessonId));

    if (body.action === "reset") {
      await db.delete(lessonProgress).where(owned);
      return Response.json({ reset: true });
    }

    if (body.action !== "complete") return Response.json({ error: "Unsupported action" }, { status: 400 });

    // Scores only make sense on a check, and must be within the question count.
    let score: number | null = null;
    let total: number | null = null;
    if (lesson.kind === "check") {
      const questionCount = lesson.questions?.length ?? 0;
      const raw = Number(body.score);
      if (!Number.isInteger(raw) || raw < 0 || raw > questionCount) {
        return Response.json({ error: "A score between 0 and the question count is required" }, { status: 400 });
      }
      score = raw;
      total = questionCount;
    }

    const now = new Date().toISOString();
    const [existing] = await db.select().from(lessonProgress).where(owned).limit(1);

    if (existing) {
      // Keep the learner's best score rather than their most recent attempt.
      const bestScore = score === null ? existing.score : Math.max(score, existing.score ?? 0);
      const [row] = await db
        .update(lessonProgress)
        .set({ status: "completed", score: bestScore, total, updatedAt: now })
        .where(eq(lessonProgress.id, existing.id))
        .returning();
      return Response.json({ progress: row });
    }

    const [row] = await db
      .insert(lessonProgress)
      .values({
        id: crypto.randomUUID(),
        ownerEmail: identity.email,
        moduleId,
        lessonId,
        status: "completed",
        score,
        total,
        completedAt: now,
        updatedAt: now,
      })
      .returning();

    return Response.json({ progress: row }, { status: 201 });
  } catch (error) {
    return serverErrorResponse("course", error, "Your progress could not be recorded.");
  }
}
