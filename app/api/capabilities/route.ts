import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { capabilityClaims, evalResults, labAttempts, labSubmissions, workflowBaselines, workflowMeasurements } from "../../../db/schema";
import { curriculumLabs } from "../../curriculum-data";
import type { DeterministicEvalResult, RubricBand } from "../../lib/attempt-types";
import { recordAudit } from "../../lib/governance";
import { boundedText, readJsonBody } from "../../lib/request-limits";
import { getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";

const parse = <T>(value: string, fallback: T) => { try { return JSON.parse(value) as T; } catch { return fallback; } };
const playForLab = (labId: string) => labId === "lab-01" ? "EXTRACT-STRUCTURE" : curriculumLabs.find((lab) => lab.id === labId)?.play ?? "AI-WORKFLOW";
const claimView = (row: typeof capabilityClaims.$inferSelect) => ({ ...row, evidence: parse(row.evidenceJson, []) });
const bandRank = { Developing: 0, Capable: 1, Strong: 2 } as const;

export async function GET(request: Request) {
  await ensureLabSchema(); const identity = await getRequestIdentity(request); if (!identity) return unauthorizedResponse();
  const claims = await getDb().select().from(capabilityClaims).where(eq(capabilityClaims.ownerEmail, identity.email)).orderBy(desc(capabilityClaims.updatedAt));
  const baselines = await getDb().select().from(workflowBaselines).where(eq(workflowBaselines.ownerEmail, identity.email)).orderBy(desc(workflowBaselines.createdAt));
  const measurements = await getDb().select().from(workflowMeasurements).where(eq(workflowMeasurements.ownerEmail, identity.email)).orderBy(desc(workflowMeasurements.measuredAt));
  const now = Date.now();
  return Response.json({ claims: claims.map((row) => ({ ...claimView(row), effectiveStatus: new Date(row.expiresAt).getTime() <= now ? "expired" : row.status })), baselines, measurements });
}

export async function POST(request: Request) {
  await ensureLabSchema(); const identity = await getRequestIdentity(request); if (!identity) return unauthorizedResponse();
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body; const action = String(body.action ?? "");
  if (action === "refresh-claims") {
    const rows = await getDb().select({ submissionId: labSubmissions.id, labId: labAttempts.labId, resultJson: evalResults.resultJson, submittedAt: labSubmissions.submittedAt })
      .from(labSubmissions).innerJoin(labAttempts, eq(labAttempts.id, labSubmissions.attemptId)).innerJoin(evalResults, eq(evalResults.submissionId, labSubmissions.id))
      .where(eq(labAttempts.ownerEmail, identity.email));
    const grouped = new Map<string, typeof rows>();
    rows.forEach((row) => { const key = playForLab(row.labId); grouped.set(key, [...(grouped.get(key) ?? []), row]); });
    const refreshed = [];
    for (const [key, evidenceRows] of grouped) {
      const scored = evidenceRows.map((row) => {
        const result = parse<DeterministicEvalResult | null>(row.resultJson, null);
        const bands: RubricBand[] = result ? Object.values(result.dimensions).map((dimension) => dimension.band) : ["Developing"];
        return { row, score: Math.min(...bands.map((band) => bandRank[band])) };
      }).sort((a, b) => b.score - a.score);
      const best = scored[0]; const band = (["Developing", "Capable", "Strong"] as const)[best.score];
      const earnedAt = best.row.submittedAt; const expiresAt = new Date(new Date(earnedAt).getTime() + 180 * 86400_000).toISOString();
      await getDb().delete(capabilityClaims).where(and(eq(capabilityClaims.ownerEmail, identity.email), eq(capabilityClaims.capabilityKey, key)));
      const [claim] = await getDb().insert(capabilityClaims).values({ id: crypto.randomUUID(), ownerEmail: identity.email, capabilityKey: key, label: key.replaceAll("-", " "), band, evidenceJson: JSON.stringify(evidenceRows.map((row) => ({ submissionId: row.submissionId, labId: row.labId, submittedAt: row.submittedAt }))), earnedAt, expiresAt }).returning();
      refreshed.push(claimView(claim));
    }
    await recordAudit(identity.email, "capabilities.refreshed", "learner", identity.email, { claimCount: refreshed.length });
    return Response.json({ claims: refreshed }, { status: 201 });
  }
  if (action === "baseline") {
    const required = ["workflowId", "workflowName", "metricName", "unit", "baselineValue", "targetValue"];
    if (required.some((key) => !String(body[key] ?? "").trim())) return Response.json({ error: "Workflow, metric, unit, baseline, and target are required" }, { status: 400 });
    const [row] = await getDb().insert(workflowBaselines).values({ id: crypto.randomUUID(), ownerEmail: identity.email, workflowId: boundedText(body.workflowId, 120), workflowName: boundedText(body.workflowName, 200), metricName: boundedText(body.metricName, 200), unit: boundedText(body.unit, 60), baselineValue: boundedText(body.baselineValue, 120), targetValue: boundedText(body.targetValue, 120), notes: boundedText(body.notes, 2000), measuredAt: boundedText(body.measuredAt || new Date().toISOString(), 40) }).returning();
    await recordAudit(identity.email, "workflow.baselined", "workflow-baseline", row.id);
    return Response.json({ baseline: row }, { status: 201 });
  }
  if (action === "measurement") {
    const baselineId = String(body.baselineId ?? "");
    const [baseline] = await getDb().select().from(workflowBaselines).where(and(eq(workflowBaselines.id, baselineId), eq(workflowBaselines.ownerEmail, identity.email))).limit(1);
    if (!baseline) return Response.json({ error: "Baseline not found" }, { status: 404 });
    if (!String(body.value ?? "").trim() || String(body.reflection ?? "").trim().length < 10) return Response.json({ error: "A value and short reflection are required" }, { status: 400 });
    const measuredAt = boundedText(body.measuredAt || new Date().toISOString(), 40);
    const [row] = await getDb().insert(workflowMeasurements).values({ id: crypto.randomUUID(), baselineId, ownerEmail: identity.email, value: boundedText(body.value, 120), sourceType: "self_attested", reflection: boundedText(body.reflection, 4000).trim(), measuredAt }).returning();
    const elapsedDays = Math.floor((new Date(measuredAt).getTime() - new Date(baseline.measuredAt).getTime()) / 86400_000);
    if (elapsedDays >= 30) {
      const capabilityKey = `TRANSFER-${baseline.workflowId}`;
      await getDb().delete(capabilityClaims).where(and(eq(capabilityClaims.ownerEmail, identity.email), eq(capabilityClaims.capabilityKey, capabilityKey)));
      await getDb().insert(capabilityClaims).values({
        id: crypto.randomUUID(), ownerEmail: identity.email, capabilityKey,
        label: `${baseline.workflowName} workplace transfer`, band: "Transferred", status: "active",
        evidenceJson: JSON.stringify([{ baselineId: baseline.id, measurementId: row.id, sourceType: "self_attested", elapsedDays }]),
        earnedAt: measuredAt, expiresAt: new Date(new Date(measuredAt).getTime() + 180 * 86400_000).toISOString(),
      });
    }
    await recordAudit(identity.email, "workflow.measured", "workflow-baseline", baselineId, { elapsedDays, evidenceTier: "self_attested" });
    return Response.json({ measurement: row, day30Eligible: elapsedDays >= 30, elapsedDays }, { status: 201 });
  }
  return Response.json({ error: "Unsupported action" }, { status: 400 });
}
