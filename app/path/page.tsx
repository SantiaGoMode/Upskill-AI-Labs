"use client";

import Link from "next/link";
import { labById } from "../lib/labs";
import type { RecipeNode } from "../lib/recipe-engine";
import { priorityWorkflows, type WorkflowCandidate } from "../lib/redaction";
import { isViewer, useIdentity, useResource } from "../lib/client-api";
import { Badge, Callout, Card, LinkButton, Page, PageHeader, Section, Spinner } from "../components/ui";

type OnboardingState = {
  workflowMap: { id: string; intakeTier: string; workflows: WorkflowCandidate[]; priorityWorkflowIds: string[]; status: string } | null;
  curriculum: { route: RecipeNode[]; estimatedMinutes: number; recipeVersion: string } | null;
  policy: { name: string; version: number; allowedIntakeTier: string };
};

const MODE_TONE: Record<RecipeNode["mode"], "neutral" | "info" | "warn"> = {
  standard: "neutral",
  compressed: "info",
  remediation: "warn",
};

export default function PathwayPage() {
  const { identity, loading: identityLoading } = useIdentity();
  const readOnly = isViewer(identity);
  const { data, loading, error } = useResource<OnboardingState>("/api/onboarding");

  const route = data?.curriculum?.route ?? [];
  const workflowMap = data?.workflowMap;
  const priorities = priorityWorkflows(workflowMap);
  const estimatedMinutes = data?.curriculum?.estimatedMinutes ?? 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Recipe engine · fixed spine, flexible skin"
        title="My pathway"
        lede="The assessed sequence never changes. What adapts is the scenario context, the pacing, and any remediation — and every adaptation is shown to you and to your facilitator rather than applied silently."
        actions={identityLoading ? null : readOnly
          ? <LinkButton href="/course" variant="secondary">View full course</LinkButton>
          : <LinkButton href="/onboarding" variant={route.length ? "secondary" : "primary"}>{route.length ? "Redo intake" : "Start intake"}</LinkButton>}
      />

      {readOnly ? (
        <Callout tone="info" className="mb-6" title="Read-only learner record">
          This pathway shows how the fixed eight-lab spine adapts for a senior program manager. You can inspect every lab, but changing the intake or pathway requires an assigned account.
        </Callout>
      ) : null}

      {error ? <Callout tone="risk" className="mb-6">{error}</Callout> : null}

      {loading ? (
        <Spinner label="Loading your pathway…" />
      ) : !route.length ? (
        <Callout tone="info" title="No personalized pathway yet.">
          Complete the Bring Your Own Job intake and the engine will skin the same eight labs to the three workflows you
          picked. Until then every lab runs with its default Northwind scenario — which is fully assessable on its own.
        </Callout>
      ) : (
        <>
          <div className="mb-8 flex flex-wrap gap-3">
            <Card className="min-w-[180px] flex-1 px-4 py-3">
              <p className="eyebrow">Estimated time</p>
              <p className="mt-1.5 font-display text-[26px] font-bold tabular-nums">
                {Math.round(estimatedMinutes / 60)}h {estimatedMinutes % 60}m
              </p>
              <p className="mt-1 text-[12px] text-muted">Updates as the path adapts — never a fixed promise</p>
            </Card>
            <Card className="min-w-[180px] flex-1 px-4 py-3">
              <p className="eyebrow">Intake tier</p>
              <p className="mt-1.5 font-display text-[26px] font-bold">{workflowMap?.intakeTier ?? "—"}</p>
              <p className="mt-1 text-[12px] text-muted">
                {workflowMap?.intakeTier === "T1" ? "Structure only — no artifact text left your browser" : "Role description only"}
              </p>
            </Card>
            <Card className="min-w-[180px] flex-1 px-4 py-3">
              <p className="eyebrow">Active policy</p>
              <p className="mt-1.5 text-[16px] font-bold">{data?.policy.name}</p>
              <p className="mt-1 text-[12px] text-muted">Version {data?.policy.version}</p>
            </Card>
          </div>

          {priorities.length ? (
            <Section title="Your three priority workflows" description="These are what the scenario skin is built around.">
              <div className="grid gap-3 md:grid-cols-3">
                {priorities.map((workflow) => (
                  <Card key={workflow.id} className="px-4 py-4">
                    <p className="text-[15px] font-bold">{workflow.name}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted">
                      {workflow.trigger} → {workflow.outcome}
                    </p>
                    <Badge className="mt-3">{workflow.frequency}</Badge>
                  </Card>
                ))}
              </div>
            </Section>
          ) : null}

          <Section title="Assessed spine" description="Eight labs, in order. Mode and reason are always visible.">
            <ol className="grid list-none gap-2 p-0">
              {route.map((node) => {
                const lab = labById(node.labId);
                return (
                  <li key={node.labId}>
                    <Link
                      href={`/lab/${node.labId}`}
                      className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-4 rounded-[10px] border border-line bg-raised px-4 py-3.5 transition-colors hover:bg-inset"
                    >
                      <span className="font-mono text-[13px] text-subtle">{String(node.order).padStart(2, "0")}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-bold">{lab?.title ?? node.title}</span>
                        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{node.reason}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[13px] text-muted tabular-nums">{node.minutes}m</span>
                        <Badge tone={MODE_TONE[node.mode]}>{node.mode}</Badge>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </Section>

          <Callout tone="info">
            Two learners in the same role should be able to talk to each other about the same lab. Variation is bounded
            on purpose: the assessment criteria, guardrail modules, and passing thresholds are identical for everyone.
          </Callout>
        </>
      )}
    </Page>
  );
}
