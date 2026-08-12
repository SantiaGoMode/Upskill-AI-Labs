"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { artifactShapeFromText, type ArtifactShape, type WorkflowCandidate } from "../lib/redaction";
import { errorMessage, isViewer, post, useIdentity, useResource } from "../lib/client-api";
import {
  Badge,
  Banners,
  Button,
  Callout,
  Card,
  cx,
  LinkButton,
  Page,
  PageHeader,
  Section,
  SelectField,
  Spinner,
  TextArea,
  TextField,
} from "../components/ui";

type WorkflowMap = {
  id: string;
  intakeTier: string;
  workflows: WorkflowCandidate[];
  priorityWorkflowIds: string[];
  status: string;
};

type OnboardingState = {
  workflowMap: WorkflowMap | null;
  policy: { allowedIntakeTier: string; name: string };
  experiment: { T0: { count: number; average: number | null }; T1: { count: number; average: number | null }; delta: number | null; decision: string };
};

const TIER_COPY: Record<string, string> = {
  T0: "A description of your role. Nothing else leaves this page.",
  T1: "A representative artifact is measured in your browser. Only counts and structural markers are sent — never the words.",
  T2: "Full artifacts, processed in-tenancy. Disabled in this local build.",
};

export default function OnboardingPage() {
  const router = useRouter();
  const { identity, loading: identityLoading } = useIdentity();
  const readOnly = isViewer(identity);
  const { data, loading, error: loadError, reload } = useResource<OnboardingState>("/api/onboarding");

  const [role, setRole] = useState(
    "Program manager coordinating cross-functional delivery, governance, risks, and executive reporting.",
  );
  const [industry, setIndustry] = useState("Technology");
  const [seniority, setSeniority] = useState("Senior program manager");
  const [tier, setTier] = useState("T1");
  const [artifactName, setArtifactName] = useState("weekly-status.md");
  const [artifactText, setArtifactText] = useState("");

  const [map, setMap] = useState<WorkflowMap | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const shape = useMemo(
    () => (artifactText.trim() ? artifactShapeFromText(artifactName, artifactText) : null),
    [artifactName, artifactText],
  );

  const workflowMap = map ?? data?.workflowMap ?? null;
  const maxTier = data?.policy.allowedIntakeTier ?? "T1";
  const tierBlocked = tier === "T2" || (maxTier === "T0" && tier !== "T0");

  async function propose() {
    setBusy(true);
    setError("");
    try {
      const artifactShapes: ArtifactShape[] = tier === "T1" && shape ? [shape] : [];
      const result = await post<{ workflowMap: WorkflowMap }>("/api/onboarding", {
        action: "propose",
        roleDescription: role,
        industry,
        seniority,
        intakeTier: tier,
        artifactShapes,
      });
      setMap(result.workflowMap);
    } catch (cause) {
      setError(errorMessage(cause, "Unable to propose workflows"));
    } finally {
      setBusy(false);
    }
  }

  /** Deselecting always works; selecting is capped at three, so the fourth click is ignored. */
  function togglePriority(id: string) {
    if (!workflowMap) return;
    const current = workflowMap.priorityWorkflowIds;
    if (current.includes(id)) {
      setMap({ ...workflowMap, priorityWorkflowIds: current.filter((item) => item !== id) });
    } else if (current.length < 3) {
      setMap({ ...workflowMap, priorityWorkflowIds: [...current, id] });
    }
  }

  async function confirm() {
    if (!workflowMap) return;
    setBusy(true);
    setError("");
    try {
      await post("/api/onboarding", {
        action: "confirm",
        mapId: workflowMap.id,
        workflows: workflowMap.workflows,
        priorityWorkflowIds: workflowMap.priorityWorkflowIds,
      });
      await reload();
      router.push("/path");
      // `busy` stays set on success so the button cannot be pressed twice while
      // the route transition is in flight; only the failure path releases it.
    } catch (cause) {
      setError(errorMessage(cause, "Unable to build your pathway"));
      setBusy(false);
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Bring your own job"
        title="Map the work before adapting the course"
        lede="A ten-minute structured intake, not a self-assessment quiz. The engine proposes nine workflows it thinks you own; correcting that list is the part that matters."
      />

      <Banners errors={[loadError, error]} />

      {loading || identityLoading ? (
        <Spinner label="Loading intake…" />
      ) : readOnly ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Section title="Confirmed learner context">
            <Card className="p-5">
              <Badge tone="warn">Read-only demo</Badge>
              <h2 className="mt-4 text-[20px] font-bold">Senior program manager · Technology</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                This representative intake used T1 structural redaction. The raw artifact stayed in the learner&rsquo;s browser; only its non-content shape informed the workflow map.
              </p>
              <dl className="mt-5 grid gap-3 text-[13px]">
                <div><dt className="text-muted">Intake tier</dt><dd className="mt-1 font-bold">T1 · Redacted structure</dd></div>
                <div><dt className="text-muted">Workflow map</dt><dd className="mt-1 font-bold">9 confirmed · 3 prioritized</dd></div>
                <div><dt className="text-muted">Policy</dt><dd className="mt-1 font-bold">{data?.policy.name}</dd></div>
              </dl>
              <LinkButton href="/path" variant="primary" className="mt-6 w-full">View the resulting pathway</LinkButton>
            </Card>
          </Section>

          <Section title="Confirmed workflow map" description="Priority workflows are marked and drive the scenario skin across all eight labs.">
            <Card className="overflow-hidden">
              <ul className="m-0 list-none p-0">
                {(workflowMap?.workflows ?? []).map((workflow, index) => {
                  const selected = workflowMap?.priorityWorkflowIds.includes(workflow.id);
                  return (
                    <li key={workflow.id} className={cx("grid grid-cols-[26px_1fr_auto] gap-3 border-t border-line px-4 py-3 first:border-t-0", selected && "bg-ok-bg")}>
                      <span className={cx("mt-0.5 grid h-[22px] w-[22px] place-items-center rounded-full border text-[11px] font-bold", selected ? "border-ok-fg bg-ok-fg text-[color:var(--bg-raised)]" : "border-line-strong text-subtle")}>{selected ? "✓" : index + 1}</span>
                      <span className="min-w-0"><span className="block text-[14px] font-bold">{workflow.name}</span><span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{workflow.trigger} → {workflow.outcome}</span></span>
                      {selected ? <Badge tone="ok">Priority</Badge> : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </Section>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="1 · Describe the work">
            <Card className="p-5">
              <TextArea
                label="Role description"
                rows={4}
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="mb-4"
              />
              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <TextField label="Industry" value={industry} onChange={(event) => setIndustry(event.target.value)} />
                <TextField label="Seniority" value={seniority} onChange={(event) => setSeniority(event.target.value)} />
              </div>

              <SelectField
                label="Intake tier"
                hint={`Policy allows up to ${maxTier}`}
                value={tier}
                onChange={(event) => setTier(event.target.value)}
                className="mb-3"
              >
                <option value="T0">T0 · Describe only</option>
                <option value="T1">T1 · Redacted structure</option>
                <option value="T2">T2 · Full artifact (not enabled)</option>
              </SelectField>
              <p className="mb-4 text-[13px] leading-relaxed text-muted">{TIER_COPY[tier]}</p>

              {tier === "T1" ? (
                <>
                  <Callout tone="ok" title="Raw text stays in this browser." className="mb-4">
                    The server receives counts and structural markers only — never the artifact&rsquo;s words. The
                    onboarding endpoint rejects raw-content fields outright.
                  </Callout>
                  <TextField
                    label="Artifact name"
                    value={artifactName}
                    onChange={(event) => setArtifactName(event.target.value)}
                    className="mb-4"
                  />
                  <TextArea
                    label="Paste a representative artifact"
                    rows={6}
                    value={artifactText}
                    onChange={(event) => setArtifactText(event.target.value)}
                    placeholder="Paste locally to generate a non-content structural profile…"
                  />
                  {shape ? (
                    <div className="mt-4 rounded-[10px] border border-ok-line bg-ok-bg px-4 py-3 text-[13px] text-ok-fg">
                      <p className="font-bold">Safe shape preview</p>
                      <p className="mt-1.5 opacity-90">
                        {shape.lengthBucket} · {shape.lines} lines · {shape.paragraphs} paragraphs · {shape.headings} headings ·{" "}
                        {shape.listItems} list items · {shape.tableRows} table rows
                      </p>
                      <p className="mt-1 opacity-90">
                        {shape.markers.dates} date · {shape.markers.emails} email · {shape.markers.currency} currency ·{" "}
                        {shape.markers.phones} phone markers
                      </p>
                      <p className="mt-2 font-semibold">This is the entire payload. Nothing else is transmitted.</p>
                    </div>
                  ) : null}
                </>
              ) : null}

              {tierBlocked ? (
                <Callout tone="warn" className="mt-4">
                  {tier === "T2"
                    ? "T2 requires tenant-isolated storage and stays disabled in this local build."
                    : `The active policy caps intake at ${maxTier}.`}
                </Callout>
              ) : null}

              <Button
                variant="primary"
                className="mt-5 w-full"
                onClick={() => void propose()}
                disabled={busy || tierBlocked || (tier === "T1" && !shape) || role.trim().length < 12}
              >
                {busy ? "Working…" : "Propose nine workflows"}
              </Button>
            </Card>
          </Section>

          <Section title="2 · Correct the map">
            {!workflowMap ? (
              <Card className="border-dashed p-8 text-center">
                <p className="text-[15px] font-bold">Your workflow map will appear here.</p>
                <p className="mx-auto mt-2 max-w-[44ch] text-[14px] text-muted">
                  Nine candidate workflows, from which you pick the three that hurt most. That correction is what gives
                  the engine ground truth.
                </p>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <p className="m-0 text-[14px] font-semibold">Choose exactly three</p>
                  <Badge tone={workflowMap.priorityWorkflowIds.length === 3 ? "ok" : "warn"}>
                    {workflowMap.priorityWorkflowIds.length}/3 selected
                  </Badge>
                </div>
                <ul className="m-0 list-none p-0">
                  {workflowMap.workflows.map((workflow, index) => {
                    const selected = workflowMap.priorityWorkflowIds.includes(workflow.id);
                    return (
                      <li key={workflow.id}>
                        <button
                          type="button"
                          onClick={() => togglePriority(workflow.id)}
                          aria-pressed={selected}
                          className={cx(
                            "grid w-full grid-cols-[26px_1fr] gap-3 border-t border-line px-4 py-3 text-left transition-colors first:border-t-0",
                            selected ? "bg-ok-bg" : "hover:bg-inset",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cx(
                              "mt-0.5 grid h-[22px] w-[22px] place-items-center rounded-full border text-[11px] font-bold",
                              selected ? "border-ok-fg bg-ok-fg text-[color:var(--bg-raised)]" : "border-line-strong text-subtle",
                            )}
                          >
                            {selected ? "✓" : index + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[14px] font-bold">{workflow.name}</span>
                            <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                              {workflow.trigger} → {workflow.outcome}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="border-t border-line p-4">
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => void confirm()}
                    disabled={busy || workflowMap.priorityWorkflowIds.length !== 3}
                  >
                    {busy ? "Building…" : "Confirm and build my pathway"}
                  </Button>
                </div>
              </Card>
            )}

            {data?.experiment ? (
              <p className="mt-4 text-[13px] leading-relaxed text-muted">
                <span className="font-semibold text-fg">T1 transfer experiment:</span> {data.experiment.T1.count} T1 and{" "}
                {data.experiment.T0.count} T0 measurements recorded ·{" "}
                {data.experiment.delta === null
                  ? "still collecting a baseline"
                  : `${data.experiment.delta > 0 ? "+" : ""}${data.experiment.delta.toFixed(1)} points vs T0`}{" "}
                · decision: {data.experiment.decision}
              </p>
            ) : null}
          </Section>
        </div>
      )}
    </Page>
  );
}
