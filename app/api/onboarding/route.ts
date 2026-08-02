import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { curriculumInstances, redactionExperiments, workflowMaps } from "../../../db/schema";
import { activePolicy, permitsIntakeTier, recordAudit } from "../../lib/governance";
import { buildRecipe } from "../../lib/recipe-engine";
import { isArtifactShape, proposeWorkflows, type ArtifactShape, type IntakeTier, type WorkflowCandidate } from "../../lib/redaction";
import { getRequestIdentity, unauthorizedResponse } from "../../lib/request-identity";

const parse = <T>(value: string, fallback: T) => { try { return JSON.parse(value) as T; } catch { return fallback; } };
const mapRow = (row: typeof workflowMaps.$inferSelect) => ({
  ...row, artifactShapes: parse<ArtifactShape[]>(row.artifactShapesJson, []),
  workflows: parse<WorkflowCandidate[]>(row.workflowsJson, []),
  priorityWorkflowIds: parse<string[]>(row.priorityWorkflowIdsJson, []),
});
const instanceRow = (row: typeof curriculumInstances.$inferSelect) => ({
  ...row, route: parse(row.routeJson, []), adaptations: parse(row.adaptationsJson, {}),
});

async function transferSummary() {
  const rows = await getDb().select().from(redactionExperiments);
  const average = (tier: "T0" | "T1") => {
    const scores = rows.filter((row) => row.tier === tier && row.transferScore !== null).map((row) => row.transferScore!);
    return { count: scores.length, average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null };
  };
  const t0 = average("T0"); const t1 = average("T1");
  const delta = t0.average === null || t1.average === null ? null : t1.average - t0.average;
  return { T0: t0, T1: t1, delta, decision: delta === null ? "collecting" : delta > 0 ? "continue-T1" : "narrow-to-T2" };
}

export async function GET(request: Request) {
  await ensureLabSchema();
  const identity = getRequestIdentity(request); if (!identity) return unauthorizedResponse();
  const [map] = await getDb().select().from(workflowMaps).where(eq(workflowMaps.ownerEmail, identity.email)).orderBy(desc(workflowMaps.updatedAt)).limit(1);
  const [instance] = await getDb().select().from(curriculumInstances).where(eq(curriculumInstances.ownerEmail, identity.email)).orderBy(desc(curriculumInstances.updatedAt)).limit(1);
  const [currentExperiment] = map ? await getDb().select().from(redactionExperiments).where(eq(redactionExperiments.workflowMapId, map.id)).orderBy(desc(redactionExperiments.createdAt)).limit(1) : [];
  return Response.json({ workflowMap: map ? mapRow(map) : null, curriculum: instance ? instanceRow(instance) : null, currentExperiment: currentExperiment ?? null, experiment: await transferSummary(), policy: await activePolicy() });
}

export async function POST(request: Request) {
  try {
    await ensureLabSchema();
    const identity = getRequestIdentity(request); if (!identity) return unauthorizedResponse();
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "propose") {
      const tier = String(body.intakeTier ?? "T0") as IntakeTier;
      if (!["T0", "T1", "T2"].includes(tier)) return Response.json({ error: "A valid intake tier is required" }, { status: 400 });
      const policy = await activePolicy();
      if (!permitsIntakeTier(policy, tier)) return Response.json({ error: `${tier} intake is not allowed by the active policy` }, { status: 403 });
      if (tier === "T2") return Response.json({ error: "T2 full-artifact intake requires tenant-isolated storage and is not enabled in this local build" }, { status: 501 });
      if ("rawArtifact" in body || "artifactText" in body || "content" in body) return Response.json({ error: "Raw artifact content is never accepted; send a client-side shape only" }, { status: 400 });
      const roleDescription = String(body.roleDescription ?? "").trim();
      if (roleDescription.length < 12) return Response.json({ error: "Describe the role in at least 12 characters" }, { status: 400 });
      const shapes = tier === "T1" && Array.isArray(body.artifactShapes) ? body.artifactShapes : [];
      if (!shapes.every(isArtifactShape) || shapes.length > 10) return Response.json({ error: "Artifact shapes are invalid" }, { status: 400 });
      const industry = String(body.industry ?? "General").trim().slice(0, 80);
      const seniority = String(body.seniority ?? "Individual contributor").trim().slice(0, 80);
      const workflows = proposeWorkflows(roleDescription, industry, shapes as ArtifactShape[]);
      const id = crypto.randomUUID();
      const [row] = await getDb().insert(workflowMaps).values({ id, ownerEmail: identity.email, roleDescription, intakeTier: tier, industry, seniority, artifactShapesJson: JSON.stringify(shapes), workflowsJson: JSON.stringify(workflows) }).returning();
      await getDb().insert(redactionExperiments).values({ id: crypto.randomUUID(), ownerEmail: identity.email, workflowMapId: id, tier });
      await recordAudit(identity.email, "workflow-map.proposed", "workflow-map", id, { tier, shapeCount: shapes.length });
      return Response.json({ workflowMap: mapRow(row) }, { status: 201 });
    }
    if (body.action === "confirm") {
      const mapId = String(body.mapId ?? "");
      const [map] = await getDb().select().from(workflowMaps).where(and(eq(workflowMaps.id, mapId), eq(workflowMaps.ownerEmail, identity.email))).limit(1);
      if (!map) return Response.json({ error: "Workflow map not found" }, { status: 404 });
      const workflows = Array.isArray(body.workflows) ? body.workflows as WorkflowCandidate[] : parse<WorkflowCandidate[]>(map.workflowsJson, []);
      const known = new Set(workflows.map((workflow) => workflow.id));
      const priorities = Array.isArray(body.priorityWorkflowIds) ? [...new Set(body.priorityWorkflowIds.map(String))] : [];
      if (workflows.length !== 9 || priorities.length !== 3 || priorities.some((id) => !known.has(id))) return Response.json({ error: "Confirm nine workflows and exactly three priorities" }, { status: 400 });
      await getDb().update(workflowMaps).set({ workflowsJson: JSON.stringify(workflows), priorityWorkflowIdsJson: JSON.stringify(priorities), status: "confirmed", updatedAt: new Date().toISOString() }).where(eq(workflowMaps.id, mapId));
      const recipe = buildRecipe({ workflows, priorityWorkflowIds: priorities, industry: map.industry, seniority: map.seniority, developingDimensions: Array.isArray(body.developingDimensions) ? body.developingDimensions.map(String) : [] });
      await getDb().update(curriculumInstances).set({ status: "superseded", updatedAt: new Date().toISOString() }).where(eq(curriculumInstances.ownerEmail, identity.email));
      const [instance] = await getDb().insert(curriculumInstances).values({ id: crypto.randomUUID(), ownerEmail: identity.email, workflowMapId: mapId, recipeVersion: recipe.recipeVersion, routeJson: JSON.stringify(recipe.route), adaptationsJson: JSON.stringify(recipe.adaptations), estimatedMinutes: recipe.estimatedMinutes }).returning();
      await recordAudit(identity.email, "workflow-map.confirmed", "workflow-map", mapId, { priorities });
      return Response.json({ workflowMap: mapRow({ ...map, workflowsJson: JSON.stringify(workflows), priorityWorkflowIdsJson: JSON.stringify(priorities), status: "confirmed" }), curriculum: instanceRow(instance) });
    }
    if (body.action === "measure-transfer") {
      const experimentId = String(body.experimentId ?? ""); const score = Number(body.score);
      if (!Number.isInteger(score) || score < 0 || score > 100) return Response.json({ error: "Transfer score must be an integer from 0 to 100" }, { status: 400 });
      const [row] = await getDb().update(redactionExperiments).set({ transferScore: score, notes: String(body.notes ?? "").slice(0, 1000), measuredAt: new Date().toISOString() }).where(and(eq(redactionExperiments.id, experimentId), eq(redactionExperiments.ownerEmail, identity.email))).returning();
      if (!row) return Response.json({ error: "Experiment not found" }, { status: 404 });
      return Response.json({ experiment: row, summary: await transferSummary() });
    }
    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Onboarding failed" }, { status: 500 }); }
}
