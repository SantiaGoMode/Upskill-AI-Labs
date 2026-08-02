"use client";

import { useEffect, useState } from "react";
import { rubricDimensions, type RubricDimension } from "./lib/hybrid-evaluation";
import type { RubricBand } from "./lib/attempt-types";

const bands: RubricBand[] = ["Developing", "Capable", "Strong"];

type DashboardSubmission = {
  id: string;
  labId: string;
  ownerEmail: string;
  submittedAt: string;
  deterministic: { dimensions: Record<RubricDimension, { band: RubricBand }> } | null;
  ensemble: { judgeCount: number; dimensions: Record<RubricDimension, { band: RubricBand; confidence: string; provisional: boolean }> } | null;
  humanReview: { rationale: string; result: Record<RubricDimension, RubricBand> } | null;
  appeals: Array<{ id: string; reason: string; status: string; resolution: string }>;
};

type Dashboard = {
  agreement: Record<RubricDimension, number | null>;
  calibrationPairs: number;
  threshold: number;
  appealRate: number;
  submissions: DashboardSubmission[];
};

export function FacilitatorConsole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [reviewBands, setReviewBands] = useState<Record<RubricDimension, RubricBand>>({ grounding: "Capable", completeness: "Capable", judgment: "Capable", efficiency: "Capable", guardrails: "Capable" });
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const response = await fetch("/api/evaluations?dashboard=1");
    const data = await response.json() as Dashboard & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to load facilitator data");
    setDashboard(data);
    if (!selectedId && data.submissions[0]) selectSubmission(data.submissions[0]);
  }

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load facilitator data"));
    }, 0);
    return () => window.clearTimeout(timer);
    // Opening the console is the load boundary; selection changes do not refetch the dashboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = dashboard?.submissions.find((submission) => submission.id === selectedId) ?? null;

  function selectSubmission(submission: DashboardSubmission) {
    setSelectedId(submission.id);
    setReviewBands(Object.fromEntries(rubricDimensions.map((dimension) => [
      dimension,
      submission.humanReview?.result[dimension] ?? submission.deterministic?.dimensions[dimension].band ?? "Capable",
    ])) as Record<RubricDimension, RubricBand>);
    setRationale(submission.humanReview?.rationale ?? "");
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/evaluations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as { dashboard?: Dashboard; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Evaluation action failed");
    if (data.dashboard) setDashboard(data.dashboard); else await refresh();
  }

  async function runJudges() {
    if (!selected || !window.confirm("Run three independent LLM judges? This makes one bounded call to Gemini, OpenAI, and Anthropic and records token cost.")) return;
    setBusy("judges"); setError("");
    try { await post({ action: "judge", submissionId: selected.id, providers: ["gemini", "openai", "anthropic"] }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Judge ensemble failed"); }
    finally { setBusy(""); }
  }

  async function saveReview() {
    if (!selected || !rationale.trim()) return;
    setBusy("review"); setError("");
    try { await post({ action: "human-review", submissionId: selected.id, bands: reviewBands, rationale }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Calibration save failed"); }
    finally { setBusy(""); }
  }

  async function resolveAppeal(appealId: string, status: "upheld" | "adjusted" | "rejected") {
    const resolution = window.prompt("Record the facilitator resolution:");
    if (!resolution?.trim()) return;
    setBusy(appealId); setError("");
    try { await post({ action: "resolve-appeal", appealId, status, resolution }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Appeal resolution failed"); }
    finally { setBusy(""); }
  }

  if (!open) return null;
  return <div className="facilitator-backdrop" role="presentation"><section className="facilitator-console" role="dialog" aria-modal="true" aria-labelledby="facilitator-title"><header><div><span className="eyebrow">Evaluation operations</span><h2 id="facilitator-title">Facilitator calibration</h2></div><button type="button" onClick={onClose} aria-label="Close facilitator console">×</button></header>{error && <p className="facilitator-error" role="alert">{error}</p>}<div className="agreement-grid">{rubricDimensions.map((dimension) => { const value = dashboard?.agreement[dimension] ?? null; return <div key={dimension} className={value !== null && value < .75 ? "provisional" : ""}><span>{dimension}</span><strong>{value === null ? "—" : value.toFixed(2)}</strong><small>{value === null ? "Needs ≥2 pairs" : value >= .75 ? "Clears 0.75" : "Provisional"}</small></div>; })}<div><span>Appeal rate</span><strong>{((dashboard?.appealRate ?? 0) * 100).toFixed(1)}%</strong><small>Target &lt;5%</small></div></div><div className="facilitator-layout"><aside><span className="eyebrow">Submissions</span>{dashboard?.submissions.length ? dashboard.submissions.map((submission) => <button type="button" className={selectedId === submission.id ? "active" : ""} key={submission.id} onClick={() => selectSubmission(submission)}><strong>{submission.labId.replace("lab-", "Lab ")}</strong><span>{submission.ownerEmail}</span><small>{submission.ensemble ? `${submission.ensemble.judgeCount} judges` : "Not judged"} · {submission.humanReview ? "calibrated" : "human review needed"}</small></button>) : <p>No submissions yet.</p>}</aside><main>{selected ? <><div className="evaluation-actions"><button type="button" onClick={runJudges} disabled={busy !== ""}>{busy === "judges" ? "Judging…" : "Run 3-judge ensemble"}</button><span>Explicit action · paid-tier equivalents recorded</span></div><div className="calibration-grid">{rubricDimensions.map((dimension) => <label key={dimension}><span>{dimension}</span><small>Deterministic: {selected.deterministic?.dimensions[dimension].band ?? "—"} · Ensemble: {selected.ensemble?.dimensions[dimension].band ?? "—"}{selected.ensemble?.dimensions[dimension].provisional ? " · provisional" : ""}</small><select value={reviewBands[dimension]} onChange={(event) => setReviewBands((current) => ({ ...current, [dimension]: event.target.value as RubricBand }))}>{bands.map((band) => <option key={band}>{band}</option>)}</select></label>)}</div><label className="review-rationale">Facilitator rationale<textarea rows={4} value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Explain disagreements and record a reusable calibration anchor." /></label><button className="save-calibration" type="button" onClick={saveReview} disabled={!rationale.trim() || busy !== ""}>{busy === "review" ? "Saving…" : "Save human calibration"}</button><section className="appeal-queue"><h3>Appeals</h3>{selected.appeals.length ? selected.appeals.map((appeal) => <article key={appeal.id}><div><strong>{appeal.status}</strong><p>{appeal.reason}</p>{appeal.resolution && <small>{appeal.resolution}</small>}</div>{appeal.status === "open" && <div><button type="button" onClick={() => resolveAppeal(appeal.id, "adjusted")} disabled={busy !== ""}>Adjust</button><button type="button" onClick={() => resolveAppeal(appeal.id, "upheld")} disabled={busy !== ""}>Uphold</button><button type="button" onClick={() => resolveAppeal(appeal.id, "rejected")} disabled={busy !== ""}>Reject</button></div>}</article>) : <p>No appeals for this submission.</p>}</section></> : <p>Select a submission to calibrate.</p>}</main></div></section></div>;
}
