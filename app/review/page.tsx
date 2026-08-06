"use client";

import { useState } from "react";
import { labById } from "../lib/labs";
import type { DeterministicEvalResult } from "../lib/attempt-types";
import { rubricDimensions, type RubricDimension } from "../lib/hybrid-evaluation";
import { formatDateTime, useResource } from "../lib/client-api";
import { useAction, type ActionRunner } from "../lib/use-action";
import { FacilitatorGuard } from "../components/facilitator-guard";
import {
  Badge,
  BandBadge,
  Banners,
  Button,
  Card,
  CardHeader,
  cx,
  EmptyState,
  Page,
  PageHeader,
  Section,
  SelectField,
  Spinner,
  Stat,
  TextArea,
} from "../components/ui";

type Band = "Developing" | "Capable" | "Strong";

type Judge = { id: string; provider: string; model: string; judgeIndex: number; overallRationale: string };

type Appeal = { id: string; reason: string; status: string; resolution: string; createdAt: string };

type Submission = {
  id: string;
  labId: string;
  ownerEmail: string;
  submittedAt: string;
  deterministic: DeterministicEvalResult | null;
  judges: Judge[];
  ensemble: { dimensions: Record<RubricDimension, { band: Band; confidence: string }> } | null;
  humanReview: { reviewerEmail: string; rationale: string; result: Record<RubricDimension, Band> | null } | null;
  appeals: Appeal[];
};

type Dashboard = {
  agreement: Record<RubricDimension, number | null>;
  calibrationPairs: number;
  threshold: number;
  appealRate: number;
  submissions: Submission[];
};

export default function ReviewPage() {
  return (
    <FacilitatorGuard>
      <Review />
    </FacilitatorGuard>
  );
}

function Review() {
  const { data, loading, error: loadError, reload } = useResource<Dashboard>("/api/evaluations?dashboard=1");
  const { busy, error, notice, run: act } = useAction("/api/evaluations", reload);
  const [selectedId, setSelectedId] = useState("");

  const submissions = data?.submissions ?? [];
  const selected = submissions.find((item) => item.id === selectedId) ?? submissions[0] ?? null;
  const openAppeals = submissions.flatMap((submission) =>
    submission.appeals.filter((appeal) => appeal.status === "open").map((appeal) => ({ appeal, submission })),
  );

  return (
    <Page>
      <PageHeader
        eyebrow="Evaluator trust"
        title="Calibration and appeals"
        lede="Judge-versus-human agreement is a first-class product metric. Any dimension below the threshold is shown to learners as provisional until it is re-calibrated."
      />

      <Banners errors={[loadError, error]} notice={notice} />

      {loading ? (
        <Spinner label="Loading calibration data…" />
      ) : (
        <>
          <Section title="Agreement by dimension" description={`Threshold ${data?.threshold ?? 0.75} · ${data?.calibrationPairs ?? 0} calibration pairs`}>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {rubricDimensions.map((dimension) => {
                const value = data?.agreement?.[dimension] ?? null;
                const provisional = value === null || value < (data?.threshold ?? 0.75);
                return (
                  <div
                    key={dimension}
                    className={cx(
                      "rounded-[10px] border-l-[3px] bg-raised px-3 py-3",
                      provisional ? "border-l-accent border border-line" : "border-l-ok-fg border border-line",
                    )}
                  >
                    <p className="text-[12px] capitalize text-muted">{dimension}</p>
                    <p className="mt-1 font-display text-[20px] font-bold tabular-nums">
                      {value === null ? "—" : value.toFixed(2)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">{provisional ? "provisional" : "calibrated"}</p>
                  </div>
                );
              })}
              <Stat label="Appeal rate" value={`${Math.round((data?.appealRate ?? 0) * 100)}%`} hint="Target under 5%" />
            </div>
          </Section>

          {openAppeals.length ? (
            <Section title={`Open appeals · ${openAppeals.length}`}>
              <ul className="grid list-none gap-2 p-0">
                {openAppeals.map(({ appeal, submission }) => (
                  <AppealRow key={appeal.id} appeal={appeal} submission={submission} busy={busy} onAct={act} />
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Submissions" description="Pick a submission to run the judge ensemble or record your own bands.">
            {submissions.length === 0 ? (
              <EmptyState title="No submissions yet">
                Once a learner submits a lab, it appears here for the judge ensemble and human calibration.
              </EmptyState>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                <ul className="grid max-h-[560px] list-none gap-1.5 overflow-y-auto p-0">
                  {submissions.map((submission) => {
                    const lab = labById(submission.labId);
                    const active = submission.id === selected?.id;
                    return (
                      <li key={submission.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(submission.id)}
                          aria-current={active ? "true" : undefined}
                          className={cx(
                            "w-full rounded-[10px] border px-3.5 py-3 text-left transition-colors",
                            active ? "border-primary bg-inset" : "border-line bg-raised hover:bg-inset",
                          )}
                        >
                          <p className="m-0 truncate text-[14px] font-bold">
                            Lab {lab?.number ?? "?"} · {lab?.title ?? submission.labId}
                          </p>
                          <p className="m-0 mt-0.5 truncate text-[12px] text-muted">{submission.ownerEmail}</p>
                          <p className="m-0 mt-0.5 text-[12px] text-muted">{formatDateTime(submission.submittedAt)}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {submission.judges.length ? <Badge tone="info">{submission.judges.length} judges</Badge> : null}
                            {submission.humanReview ? <Badge tone="ok">Calibrated</Badge> : null}
                            {submission.appeals.some((appeal) => appeal.status === "open") ? <Badge tone="warn">Appeal</Badge> : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {selected ? <SubmissionDetail key={selected.id} submission={selected} busy={busy} onAct={act} /> : null}
              </div>
            )}
          </Section>
        </>
      )}
    </Page>
  );
}

function SubmissionDetail({
  submission,
  busy,
  onAct,
}: {
  submission: Submission;
  busy: boolean;
  onAct: ActionRunner;
}) {
  const lab = labById(submission.labId);
  // Keyed by submission id at the call site, so props seed state on mount.
  const [bands, setBands] = useState<Record<string, Band>>(submission.humanReview?.result ?? {});
  const [rationale, setRationale] = useState(submission.humanReview?.rationale ?? "");

  const complete = rubricDimensions.every((dimension) => bands[dimension]);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader
          eyebrow={`Submitted ${formatDateTime(submission.submittedAt)}`}
          title={`Lab ${lab?.number ?? "?"} · ${lab?.title ?? submission.labId}`}
          meta={submission.ownerEmail}
          actions={
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => void onAct({ action: "judge", submissionId: submission.id }, "Judge ensemble complete.")}
            >
              Run 3-judge ensemble
            </Button>
          }
        />
        <div className="p-5">
          <p className="eyebrow mb-3">Deterministic result</p>
          {submission.deterministic ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(submission.deterministic.dimensions).map(([name, dimension]) => (
                <div key={name} className="flex items-center justify-between gap-3 rounded-[8px] border border-line px-3 py-2">
                  <span className="text-[13px] font-semibold capitalize">{name}</span>
                  <BandBadge band={dimension.band} />
                </div>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[14px] text-muted">No deterministic result stored.</p>
          )}

          {submission.ensemble ? (
            <>
              <p className="eyebrow mb-3 mt-5">Judge ensemble</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {rubricDimensions.map((dimension) => (
                  <div key={dimension} className="flex items-center justify-between gap-3 rounded-[8px] border border-line px-3 py-2">
                    <span className="text-[13px] font-semibold capitalize">{dimension}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[12px] text-muted">{submission.ensemble?.dimensions[dimension]?.confidence}</span>
                      <BandBadge band={submission.ensemble?.dimensions[dimension]?.band ?? "Developing"} />
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader eyebrow="Human calibration" title="Record your bands" meta="Disagreements become the next few-shot anchors." />
        <div className="p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rubricDimensions.map((dimension) => (
              <SelectField
                key={dimension}
                label={dimension}
                value={bands[dimension] ?? ""}
                onChange={(event) => setBands((current) => ({ ...current, [dimension]: event.target.value as Band }))}
              >
                <option value="">Choose…</option>
                <option>Developing</option>
                <option>Capable</option>
                <option>Strong</option>
              </SelectField>
            ))}
          </div>
          <TextArea
            label="Calibration rationale"
            rows={3}
            className="mt-4"
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            placeholder="Why these bands? This text is reused as a judge anchor."
          />
          <Button
            variant="primary"
            className="mt-4"
            disabled={busy || !complete || !rationale.trim()}
            onClick={() => void onAct({ action: "human-review", submissionId: submission.id, bands, rationale }, "Calibration saved.")}
          >
            Save calibration
          </Button>
        </div>
      </Card>
    </div>
  );
}

function AppealRow({
  appeal,
  submission,
  busy,
  onAct,
}: {
  appeal: Appeal;
  submission: Submission;
  busy: boolean;
  onAct: ActionRunner;
}) {
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [status, setStatus] = useState<"upheld" | "adjusted" | "rejected">("adjusted");
  const lab = labById(submission.labId);

  return (
    <Card as="li" className="px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[14px] font-bold">
            Lab {lab?.number ?? "?"} · {submission.ownerEmail}
          </p>
          <p className="m-0 mt-1 max-w-[70ch] text-[13px] text-muted">{appeal.reason}</p>
          <p className="m-0 mt-1 text-[12px] text-subtle">Filed {formatDateTime(appeal.createdAt)}</p>
        </div>
        <Button size="sm" onClick={() => setOpen((value) => !value)}>
          Resolve
        </Button>
      </div>

      {open ? (
        <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-[160px_1fr]">
          <SelectField label="Outcome" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="adjusted">Adjusted</option>
            <option value="upheld">Upheld</option>
            <option value="rejected">Rejected</option>
          </SelectField>
          <TextArea
            label="Resolution"
            rows={2}
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            placeholder="What you decided and why."
          />
          <Button
            variant="primary"
            size="sm"
            className="sm:col-span-2 sm:justify-self-start"
            disabled={busy || !resolution.trim()}
            onClick={() => void onAct({ action: "resolve-appeal", appealId: appeal.id, status, resolution }, "Appeal resolved.")}
          >
            Record resolution
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
