"use client";

import { useState } from "react";
import { priorityWorkflows, type WorkflowCandidate } from "../lib/redaction";
import { formatDate, isViewer, useIdentity, useResource } from "../lib/client-api";
import { useAction, type ActionRunner } from "../lib/use-action";
import {
  BandBadge,
  Badge,
  Banners,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  Page,
  PageHeader,
  Section,
  SelectField,
  Spinner,
  TextArea,
  TextField,
} from "../components/ui";

type Claim = {
  id: string;
  label: string;
  band: string;
  effectiveStatus: string;
  earnedAt: string;
  expiresAt: string;
  evidence: Array<{ labId?: string; submittedAt?: string }>;
};

type Baseline = {
  id: string;
  workflowId: string;
  workflowName: string;
  metricName: string;
  unit: string;
  baselineValue: string;
  targetValue: string;
  measuredAt: string;
};

type Measurement = { id: string; baselineId: string; value: string; reflection: string; measuredAt: string };

type LedgerState = { claims: Claim[]; baselines: Baseline[]; measurements: Measurement[] };
type OnboardingState = { workflowMap: { workflows: WorkflowCandidate[]; priorityWorkflowIds: string[] } | null };

export default function LedgerPage() {
  const { identity, loading: identityLoading } = useIdentity();
  const readOnly = isViewer(identity);
  const ledger = useResource<LedgerState>("/api/capabilities");
  const onboarding = useResource<OnboardingState>("/api/onboarding");
  const { busy, error, notice, run: act } = useAction("/api/capabilities", ledger.reload);

  const claims = ledger.data?.claims ?? [];
  const baselines = ledger.data?.baselines ?? [];
  const measurements = ledger.data?.measurements ?? [];
  const priorities = priorityWorkflows(onboarding.data?.workflowMap);

  return (
    <Page>
      <PageHeader
        eyebrow="Proof instead of certificates"
        title="Capability ledger"
        lede="Every claim points at the work that earned it, is stated as a band rather than a false-precision score, and expires after 180 days. Models change, so claims must too."
        actions={identityLoading ? null : readOnly ? (
          <Badge tone="warn">Read-only evidence</Badge>
        ) : (
          <Button variant="primary" onClick={() => void act({ action: "refresh-claims" }, "Claims refreshed from your assessed submissions.")} disabled={busy}>
            Refresh from lab evidence
          </Button>
        )}
      />

      {readOnly ? (
        <Callout tone="info" className="mb-6">
          This is a representative learner ledger. Evidence links, claim bands, expiry, baseline, and follow-up measurement are visible; refresh, baseline, and re-measure actions are disabled for demo visitors.
        </Callout>
      ) : null}

      <Banners errors={[ledger.error, error]} notice={notice} />

      <Section title="Claims" description="Earned from assessed submissions. The band is the lowest dimension on your best attempt.">
        {ledger.loading ? (
          <Spinner label="Loading claims…" />
        ) : claims.length === 0 ? (
          <EmptyState
            title="No claims yet"
            action={<LinkButton href="/" variant="primary">Go to a lab</LinkButton>}
          >
            Submit an assessed lab, then refresh. Claims are generated from real evaluations — there is no way to earn
            one by attendance.
          </EmptyState>
        ) : (
          <ul className="grid list-none gap-2 p-0">
            {claims.map((claim) => (
              <Card as="li" key={claim.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="m-0 text-[15px] font-bold capitalize">{claim.label}</p>
                  <p className="m-0 mt-1 text-[13px] text-muted">
                    {claim.evidence.length} evidence link{claim.evidence.length === 1 ? "" : "s"} · earned{" "}
                    {formatDate(claim.earnedAt)} ·{" "}
                    {claim.effectiveStatus === "expired" ? (
                      <span className="font-semibold text-risk-fg">expired {formatDate(claim.expiresAt)}</span>
                    ) : (
                      <>valid to {formatDate(claim.expiresAt)}</>
                    )}
                  </p>
                </div>
                <BandBadge band={claim.band} />
              </Card>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Workplace transfer"
        description="The top tier of claim needs a real before-and-after: a baseline now, re-measured at least 30 days later."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {readOnly ? (
            <Card className="p-5">
              <p className="eyebrow mb-2">Read-only transfer evidence</p>
              <h3 className="text-[17px] font-bold">A baseline was captured before training</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                The demo record includes a 30-day follow-up so the transfer model is visible without allowing the visitor to create or alter evidence.
              </p>
            </Card>
          ) : <BaselineForm priorities={priorities} busy={busy} onSubmit={act} />}

          <Card>
            <CardHeader eyebrow="Recorded" title="Baselines and measurements" />
            <div className="p-4">
              {baselines.length === 0 ? (
                <p className="m-0 text-[14px] text-muted">
                  No baseline recorded. Without one, the north-star metric — a workflow measurably changed and still
                  changed 30 days later — is decorative.
                </p>
              ) : (
                <ul className="grid list-none gap-3 p-0">
                  {baselines.map((baseline) => {
                    const related = measurements.filter((item) => item.baselineId === baseline.id);
                    return (
                      <li key={baseline.id} className="rounded-[10px] border border-line px-4 py-3">
                        <p className="m-0 text-[14px] font-bold">{baseline.workflowName}</p>
                        <p className="m-0 mt-1 text-[13px] text-muted">
                          {baseline.metricName}: baseline {baseline.baselineValue} {baseline.unit}, target{" "}
                          {baseline.targetValue} {baseline.unit} · set {formatDate(baseline.measuredAt)}
                        </p>
                        {related.length ? (
                          <ul className="m-0 mt-2 list-none border-t border-line p-0 pt-2">
                            {related.map((item) => (
                              <li key={item.id} className="py-1 text-[13px]">
                                <span className="font-semibold">{item.value} {baseline.unit}</span>{" "}
                                <span className="text-muted">on {formatDate(item.measuredAt)} — {item.reflection}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {!readOnly ? <MeasurementForm baseline={baseline} busy={busy} onSubmit={act} /> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </Section>

      <Callout tone="info">
        Self-attested measurements are the weakest evidence tier and are labelled as such. Manager-confirmed and
        system-verified tiers are not built in this local application.
      </Callout>
    </Page>
  );
}

function BaselineForm({
  priorities,
  busy,
  onSubmit,
}: {
  priorities: WorkflowCandidate[];
  busy: boolean;
  onSubmit: ActionRunner;
}) {
  const [workflowId, setWorkflowId] = useState(priorities[0]?.id ?? "");
  const [metricName, setMetricName] = useState("Minutes per completed workflow");
  const [unit, setUnit] = useState("minutes");
  const [baselineValue, setBaselineValue] = useState("");
  const [targetValue, setTargetValue] = useState("");

  const selected = priorities.find((item) => item.id === workflowId) ?? priorities[0];

  return (
    <Card>
      <CardHeader eyebrow="Self-attested tier" title="Record a baseline" meta="Measure before the training changes anything." />
      <div className="p-4">
        {priorities.length === 0 ? (
          <Callout tone="warn">
            Choose three priority workflows in the Bring Your Own Job intake first — a baseline needs a named workflow.
          </Callout>
        ) : (
          <>
            <SelectField
              label="Workflow"
              value={workflowId}
              onChange={(event) => setWorkflowId(event.target.value)}
              className="mb-4"
            >
              {priorities.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </SelectField>
            <TextField label="Metric" value={metricName} onChange={(event) => setMetricName(event.target.value)} className="mb-4" />
            <div className="mb-4 grid grid-cols-3 gap-3">
              <TextField label="Baseline" value={baselineValue} onChange={(event) => setBaselineValue(event.target.value)} />
              <TextField label="Target" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} />
              <TextField label="Unit" value={unit} onChange={(event) => setUnit(event.target.value)} />
            </div>
            <Button
              variant="primary"
              className="w-full"
              disabled={busy || !selected || !baselineValue.trim() || !targetValue.trim()}
              onClick={() =>
                void onSubmit(
                  {
                    action: "baseline",
                    workflowId: selected?.id,
                    workflowName: selected?.name,
                    metricName,
                    unit,
                    baselineValue,
                    targetValue,
                  },
                  "Baseline recorded.",
                )
              }
            >
              Record baseline
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function MeasurementForm({
  baseline,
  busy,
  onSubmit,
}: {
  baseline: Baseline;
  busy: boolean;
  onSubmit: ActionRunner;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [reflection, setReflection] = useState("");

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpen(true)}>
        Re-measure
      </Button>
    );
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <TextField label="Current value" value={value} onChange={(event) => setValue(event.target.value)} className="mb-3" />
      <TextArea
        label="Reflection"
        hint="At least 10 characters"
        rows={3}
        value={reflection}
        onChange={(event) => setReflection(event.target.value)}
        placeholder="What changed in how you actually do this work?"
      />
      <p className="mt-2 text-[12px] text-muted">
        Baseline set {formatDate(baseline.measuredAt)}. A workplace-transfer claim only unlocks once 30 days have passed
        since then — the server decides eligibility, not this form.
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={busy || !value.trim() || reflection.trim().length < 10}
          onClick={() =>
            void onSubmit({ action: "measurement", baselineId: baseline.id, value, reflection }, "Measurement recorded.").then(() =>
              setOpen(false),
            )
          }
        >
          Record measurement
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
