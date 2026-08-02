"use client";

import { useEffect, useMemo, useState } from "react";
import { initialDraft, intakeFields, labSources, type IntakeDraft, type IntakeKey } from "./lab-data";
import type { AttemptPayload, DeterministicEvalResult, PersistedAttempt } from "./lib/attempt-types";
import type { ModelProvider, PersistedModelRun, ProviderStatus } from "./lib/model-run-types";
import { ScoreAppeal } from "./score-appeal";

const STORAGE_KEY = "upskill-ai-labs:lab-01";

type SavedLab = {
  attemptId?: string;
  draft: IntakeDraft;
  prompt: string;
  verification: string;
  selectedSources: string[];
  provider?: ModelProvider;
  secondsLeft: number;
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function LabWorkspace() {
  const [activeSourceId, setActiveSourceId] = useState(labSources[0].id);
  const [draft, setDraft] = useState<IntakeDraft>(initialDraft);
  const [prompt, setPrompt] = useState("");
  const [verification, setVerification] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [view, setView] = useState<"source" | "prompt">("source");
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [attemptId, setAttemptId] = useState<string>("");
  const [evaluation, setEvaluation] = useState<DeterministicEvalResult | null>(null);
  const [submissionId, setSubmissionId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverStatus, setServerStatus] = useState<"local" | "saving" | "saved" | "error">("local");
  const [hydrated, setHydrated] = useState(false);
  const [savedAt, setSavedAt] = useState<string>("");
  const [modelRun, setModelRun] = useState<PersistedModelRun | null>(null);
  const [modelRunning, setModelRunning] = useState(false);
  const [modelError, setModelError] = useState("");
  const [provider, setProvider] = useState<ModelProvider>("gemini");
  const [providers, setProviders] = useState<ProviderStatus[]>([]);

  useEffect(() => {
    const hydration = window.setTimeout(async () => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as SavedLab;
          setAttemptId(parsed.attemptId ?? "");
          setDraft({ ...initialDraft, ...parsed.draft });
          setPrompt(parsed.prompt ?? "");
          setVerification(parsed.verification ?? "");
          setSelectedSources(parsed.selectedSources ?? []);
          setProvider(parsed.provider ?? "gemini");
          setSecondsLeft(parsed.secondsLeft ?? 25 * 60);
          if (parsed.attemptId) {
            const response = await fetch(`/api/attempts?id=${encodeURIComponent(parsed.attemptId)}`);
            if (response.ok) {
              const data = await response.json() as { attempt: PersistedAttempt; evaluation: DeterministicEvalResult | null; submissionId: string | null };
              setDraft({ ...initialDraft, ...data.attempt.draft });
              setPrompt(data.attempt.prompt);
              setVerification(data.attempt.verification);
              setSelectedSources(data.attempt.selectedSources);
              setSecondsLeft(data.attempt.secondsRemaining);
              setSubmitted(data.attempt.status === "submitted");
              setEvaluation(data.evaluation);
              setSubmissionId(data.submissionId ?? "");
              setServerStatus("saved");

              const runResponse = await fetch(`/api/model-runs?attemptId=${encodeURIComponent(parsed.attemptId)}`);
              if (runResponse.ok) {
                const runData = await runResponse.json() as { run: PersistedModelRun | null };
                setModelRun(runData.run);
              }
            }
          }
        } catch {
          setServerStatus("local");
        }
      }
      try {
        const providerResponse = await fetch("/api/model-runs?config=providers");
        if (providerResponse.ok) {
          const providerData = await providerResponse.json() as { providers: ProviderStatus[] };
          setProviders(providerData.providers);
        }
      } catch {
        // The run endpoint will return an actionable provider error if configuration cannot load.
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydration);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      const payload: SavedLab = { attemptId, draft, prompt, verification, selectedSources, provider, secondsLeft };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [attemptId, draft, prompt, verification, selectedSources, provider, secondsLeft, hydrated]);

  useEffect(() => {
    if (!hydrated || !attemptId || submitted) return;
    const save = window.setTimeout(async () => {
      setServerStatus("saving");
      try {
        const response = await fetch("/api/attempts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "save", id: attemptId, payload: currentPayload() }),
        });
        setServerStatus(response.ok ? "saved" : "error");
      } catch {
        setServerStatus("error");
      }
    }, 900);
    return () => window.clearTimeout(save);
  // currentPayload reads the state values listed below; keeping it outside the dependency
  // array avoids recreating the save timer for unrelated view state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, draft, prompt, verification, selectedSources, secondsLeft, hydrated, submitted]);

  useEffect(() => {
    if (!timerRunning || secondsLeft <= 0) return;
    const interval = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning, secondsLeft]);

  useEffect(() => {
    if (!submissionOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSubmissionOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [submissionOpen]);

  const activeSource = labSources.find((source) => source.id === activeSourceId) ?? labSources[0];
  const completed = useMemo(() => intakeFields.filter(([key]) => draft[key].trim()).length, [draft]);
  const readiness = Math.round((completed / intakeFields.length) * 100);

  function currentPayload(): AttemptPayload {
    return { draft, prompt, verification, selectedSources, secondsRemaining: secondsLeft };
  }

  async function ensureAttempt() {
    if (attemptId) return attemptId;
    const response = await fetch("/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start", labId: "lab-01" }),
    });
    if (!response.ok) throw new Error("Unable to start a durable lab attempt");
    const data = await response.json() as { attempt: PersistedAttempt };
    setAttemptId(data.attempt.id);
    setServerStatus("saved");
    return data.attempt.id;
  }

  async function toggleTimer() {
    if (!timerRunning) {
      try {
        await ensureAttempt();
      } catch {
        setServerStatus("error");
      }
    }
    setTimerRunning((running) => !running);
  }

  async function submitAttempt() {
    setSubmitting(true);
    setEvaluation(null);
    try {
      const id = await ensureAttempt();
      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "submit", id, payload: currentPayload() }),
      });
      if (!response.ok) throw new Error("Submission could not be evaluated");
      const data = await response.json() as { submissionId: string; result: DeterministicEvalResult };
      setEvaluation(data.result);
      setSubmissionId(data.submissionId);
      setSubmitted(true);
      setTimerRunning(false);
      setServerStatus("saved");
    } catch {
      setServerStatus("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function runModel() {
    setModelRunning(true);
    setModelError("");
    try {
      const id = await ensureAttempt();
      const response = await fetch("/api/model-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId: id, prompt, selectedSources, provider }),
      });
      const data = await response.json() as { run?: PersistedModelRun; error?: string };
      if (!response.ok || !data.run) throw new Error(data.error ?? "Model execution failed");
      setModelRun(data.run);
      setServerStatus("saved");
    } catch (error) {
      setModelError(error instanceof Error ? error.message : "Model execution failed");
    } finally {
      setModelRunning(false);
    }
  }

  function updateField(key: IntakeKey, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSubmitted(false);
    setEvaluation(null);
  }

  function toggleSource(id: string) {
    setSelectedSources((current) => current.includes(id) ? current.filter((source) => source !== id) : [...current, id]);
  }

  function resetLab() {
    if (!window.confirm("Reset this attempt and remove the locally saved draft?")) return;
    window.localStorage.removeItem(STORAGE_KEY);
    setDraft({ ...initialDraft });
    setPrompt("");
    setVerification("");
    setSelectedSources([]);
    setSecondsLeft(25 * 60);
    setTimerRunning(false);
    setSubmitted(false);
    setAttemptId("");
    setEvaluation(null);
    setServerStatus("local");
    setModelRun(null);
    setModelError("");
    setProvider("gemini");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Upskill AI Labs home"><span className="brand-mark">U</span><span>Upskill AI Labs</span></a>
        <div className="lab-identity"><span className="eyebrow">Program manager pathway</span><strong>Lab 1 of 8</strong></div>
        <div className={`session-status ${serverStatus}`}><span className="status-dot" aria-hidden="true" />{serverStatus === "saving" ? "Saving to lab record…" : serverStatus === "saved" ? `Lab record saved${savedAt ? ` · ${savedAt}` : ""}` : serverStatus === "error" ? "Server unavailable · local draft safe" : "Draft saved locally"}</div>
      </header>

      <section className="brief-strip" id="top">
        <div><p className="eyebrow accent">Project Beacon · August 3, 2026</p><h1>Triage the Beacon intake</h1><p>Turn an urgent feature request into a validated intake record. Separate evidence from assumption, respect the data boundary, and make a human-owned recommendation.</p></div>
        <div className="brief-actions">
          <button className="quiet-action" type="button" onClick={resetLab}>Reset</button>
          <div className="timebox"><span>Timebox</span><strong aria-live="polite">{formatTime(secondsLeft)}</strong></div>
          <button className="primary-action" type="button" onClick={toggleTimer}>{timerRunning ? "Pause" : secondsLeft < 25 * 60 ? "Resume" : "Begin lab"}</button>
        </div>
      </section>

      <section className="workspace" aria-label="Lab workspace">
        <aside className="source-rail">
          <div className="panel-heading"><div><span className="eyebrow">Evidence set</span><h2>Source library</h2></div><span className="count">5</span></div>
          <nav aria-label="Lab sources">
            {labSources.map((source, index) => <button className={`source-item${activeSourceId === source.id ? " active" : ""}`} type="button" key={source.id} onClick={() => { setActiveSourceId(source.id); setView("source"); }} aria-current={activeSourceId === source.id ? "page" : undefined}><span className="source-number">{String(index + 1).padStart(2, "0")}</span><span><strong>{source.title}</strong><small>{source.id} · {source.note}</small></span></button>)}
          </nav>
          <button className={`prompt-entry${view === "prompt" ? " active" : ""}`} type="button" onClick={() => setView("prompt")}><span className="prompt-icon">↗</span><span><strong>AI workbench</strong><small>Build a bounded extraction prompt</small></span></button>
          <div className="policy-note"><span className="shield" aria-hidden="true">◇</span><div><strong>Policy boundary active</strong><p>Confidential content must not enter an AI tool.</p></div></div>
        </aside>

        {view === "source" ? <SourceViewer source={activeSource} /> : <PromptWorkbench prompt={prompt} setPrompt={setPrompt} selectedSources={selectedSources} toggleSource={toggleSource} provider={provider} setProvider={setProvider} providers={providers} modelRun={modelRun} modelRunning={modelRunning} modelError={modelError} runModel={runModel} />}

        <aside className="workbench-panel">
          <div className="panel-heading"><div><span className="eyebrow">Your work</span><h2>Intake draft</h2></div><span className="progress-label">{completed} / 19 fields</span></div>
          <div className="progress-track" aria-label={`${readiness}% complete`}><span style={{ width: `${readiness}%` }} /></div>
          <Field label="Request title" value={draft.requestTitle} onChange={(value) => updateField("requestTitle", value)} />
          <Field label="Requested delivery date" value={draft.requestedDate} placeholder="Unknown until supported" onChange={(value) => updateField("requestedDate", value)} />
          <label>Roadmap alignment<select value={draft.alignment} onChange={(event) => updateField("alignment", event.target.value)}><option value="">Choose from evidence</option><option>Out of current pilot scope</option><option>In scope</option><option>Unknown</option></select></label>
          <label>Recommended disposition<select value={draft.disposition} onChange={(event) => updateField("disposition", event.target.value)}><option value="">Make the human decision</option><option>Seek clarification</option><option>Defer</option><option>Accept</option></select></label>
          <label>Evidence-linked rationale<textarea value={draft.rationale} onChange={(event) => updateField("rationale", event.target.value)} placeholder="State your reasoning and cite source IDs…" rows={5} /></label>
          <button className="secondary-action" type="button" onClick={() => setSubmissionOpen(true)}>Open full submission <span>{readiness}%</span></button>
        </aside>
      </section>

      {submissionOpen && <SubmissionDialog draft={draft} updateField={updateField} verification={verification} setVerification={setVerification} completed={completed} submitted={submitted} submitting={submitting} evaluation={evaluation} submissionId={submissionId} onSubmit={submitAttempt} onRevise={() => { setEvaluation(null); setSubmitted(false); }} onClose={() => setSubmissionOpen(false)} />}
    </main>
  );
}

function SourceViewer({ source }: { source: (typeof labSources)[number] }) {
  return <article className="document-panel"><div className="document-meta"><div><span className="eyebrow">{source.id}</span><h2>{source.title}</h2></div><span className={`classification${source.classification === "Internal" ? " internal" : ""}`}>{source.classification}</span></div>{source.meta && <div className="email-meta">{source.meta.map(([label, value]) => <div className="meta-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>}<div className="document-body">{source.sections.map((section, index) => <section key={index}>{section.heading && <h3>{section.heading}</h3>}{section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}{section.callout && <div className="redacted-block"><span>{section.callout.label}</span><strong>{section.callout.title}</strong><p>{section.callout.body}</p></div>}</section>)}</div></article>;
}

function PromptWorkbench({ prompt, setPrompt, selectedSources, toggleSource, provider, setProvider, providers, modelRun, modelRunning, modelError, runModel }: { prompt: string; setPrompt: (value: string) => void; selectedSources: string[]; toggleSource: (id: string) => void; provider: ModelProvider; setProvider: (value: ModelProvider) => void; providers: ProviderStatus[]; modelRun: PersistedModelRun | null; modelRunning: boolean; modelError: string; runModel: () => void }) {
  const selectedProvider = providers.find((item) => item.provider === provider);
  return <article className="document-panel prompt-panel"><div className="document-meta"><div><span className="eyebrow">AI surface</span><h2>Extraction workbench</h2></div><span className="classification internal">Policy bounded</span></div><div className="prompt-guidance"><strong>Build the boundary before the prompt.</strong><p>Select only sources allowed by policy. The confidential request email is intentionally unavailable for direct inclusion; redact it outside the AI surface first.</p></div><fieldset><legend>Model provider</legend><div className="provider-grid">{providers.length ? providers.map((item) => <button type="button" className={`provider-option${provider === item.provider ? " selected" : ""}`} key={item.provider} onClick={() => setProvider(item.provider)} aria-pressed={provider === item.provider}><span><strong>{item.label}</strong><i className={item.configured ? "ready" : "missing"}>{item.configured ? "Ready" : "Key needed"}</i></span><small>{item.model}</small><em>{item.note}</em></button>) : <span className="provider-loading">Loading provider configuration…</span>}</div></fieldset><fieldset><legend>Sources supplied to AI</legend>{labSources.map((source) => <label className={`source-check${source.classification !== "Internal" ? " blocked" : ""}`} key={source.id}><input type="checkbox" checked={selectedSources.includes(source.id)} disabled={source.classification !== "Internal"} onChange={() => toggleSource(source.id)} /><span><strong>{source.id}</strong><small>{source.classification !== "Internal" ? "Blocked by policy" : source.title}</small></span></label>)}</fieldset><label className="prompt-label">Prompt notebook<textarea rows={9} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Define the schema, evidence rules, Unknown behavior, and the boundary between extraction and human judgment…" /></label><div className="prompt-footer"><span>{prompt.trim() ? prompt.trim().split(/\s+/).length : 0} words · {selectedSources.length} sources</span><button type="button" onClick={() => navigator.clipboard?.writeText(prompt)} disabled={!prompt}>Copy prompt</button></div><button className="model-run-action" type="button" onClick={runModel} disabled={!prompt.trim() || selectedSources.length === 0 || modelRunning || selectedProvider?.configured === false}>{modelRunning ? `Running with ${selectedProvider?.label ?? provider}…` : `Run with ${selectedProvider?.label ?? provider}`}<span aria-hidden="true">→</span></button>{modelError && <div className="model-error" role="alert"><strong>Model run unavailable</strong><p>{modelError}</p></div>}{modelRun && <ModelRunPanel run={modelRun} />}</article>;
}

function formatCost(value: number | null) {
  if (value === null) return "Not metered";
  return value < 0.01 ? `$${value.toFixed(5)}` : `$${value.toFixed(3)}`;
}

function ModelRunPanel({ run }: { run: PersistedModelRun }) {
  return <section className="model-run-panel" aria-live="polite"><header><div><span className="eyebrow">Latest model output · {run.provider}</span><h3>Evidence extraction</h3></div><span className="run-status">{run.trace.status}</span></header><div className="model-output">{run.outputText}</div><div className="meter-grid"><div><span>Input</span><strong>{run.usage.inputTokens.toLocaleString()}</strong><small>{run.usage.cachedInputTokens.toLocaleString()} hit · {run.usage.cacheWriteTokens.toLocaleString()} write</small></div><div><span>Output</span><strong>{run.usage.outputTokens.toLocaleString()}</strong><small>{run.usage.reasoningTokens.toLocaleString()} reasoning</small></div><div><span>Total</span><strong>{run.usage.totalTokens.toLocaleString()}</strong><small>tokens</small></div><div><span>Est. cost</span><strong>{formatCost(run.cost.estimatedUsd)}</strong><small>{run.provider === "gemini" ? "paid equivalent" : "USD"}</small></div></div><details className="trace-details"><summary>View execution trace</summary><dl><div><dt>Response</dt><dd>{run.trace.responseId}</dd></div><div><dt>Provider</dt><dd>{run.provider}</dd></div><div><dt>Model</dt><dd>{run.model}</dd></div><div><dt>Endpoint</dt><dd>{run.trace.endpoint}</dd></div><div><dt>Duration</dt><dd>{(run.trace.durationMs / 1000).toFixed(2)}s</dd></div><div><dt>Sources</dt><dd>{run.trace.sourceIds.join(", ")}</dd></div><div><dt>Completed</dt><dd>{new Date(run.trace.completedAt).toLocaleString()}</dd></div><div><dt>Pricing</dt><dd>{run.cost.pricingBasis}</dd></div></dl></details><p className="model-output-note">Model output is evidence to inspect, not an approved disposition. Verify material claims before moving them into the intake.</p></section>;
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return <label>{label}<input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SubmissionDialog({ draft, updateField, verification, setVerification, completed, submitted, submitting, evaluation, submissionId, onSubmit, onRevise, onClose }: { draft: IntakeDraft; updateField: (key: IntakeKey, value: string) => void; verification: string; setVerification: (value: string) => void; completed: number; submitted: boolean; submitting: boolean; evaluation: DeterministicEvalResult | null; submissionId: string; onSubmit: () => void; onRevise: () => void; onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation"><section className="submission-dialog" role="dialog" aria-modal="true" aria-labelledby="submission-title"><header><div><span className="eyebrow">Lab 1 deliverable</span><h2 id="submission-title">Validated intake record</h2></div><button type="button" onClick={onClose} aria-label="Close submission">×</button></header>{submitted && <div className={`submission-notice${evaluation?.passed ? " passed" : " revision"}`} aria-live="polite"><strong>{evaluation?.passed ? "Deterministic gate passed." : "Revision required before facilitator review."}</strong><span>{evaluation?.summary ?? "Your submission is stored in the lab record."}</span></div>}<div className="submission-body">{evaluation ? <><EvaluationPanel result={evaluation} onRevise={onRevise} />{submissionId && <ScoreAppeal submissionId={submissionId} />}</> : <><div className="field-grid">{intakeFields.map(([key, label]) => <label key={key} className={key === "businessProblem" || key === "rationale" || key === "dependencies" ? "wide" : ""}>{label}{key === "businessProblem" || key === "rationale" || key === "dependencies" ? <textarea rows={3} value={draft[key]} onChange={(event) => updateField(key, event.target.value)} placeholder="Use Unknown when evidence is absent" /> : <input value={draft[key]} onChange={(event) => updateField(key, event.target.value)} placeholder="Unknown when unsupported" />}</label>)}</div><label className="verification-field">Verification note<textarea rows={5} value={verification} onChange={(event) => setVerification(event.target.value)} placeholder="Name material fields checked manually, sources supplied to AI, withheld passages, and remaining uncertainty." /></label></>}</div><footer><span><strong>{completed}</strong> of 19 fields completed</span><div><button className="quiet-action dark" type="button" onClick={onClose}>Keep working</button>{!evaluation && <button className="primary-action" type="button" onClick={onSubmit} disabled={completed < 19 || !verification.trim() || submitting}>{submitting ? "Evaluating…" : "Submit for review"}</button>}</div></footer></section></div>;
}

function EvaluationPanel({ result, onRevise }: { result: DeterministicEvalResult; onRevise: () => void }) {
  return <section className="evaluation-panel"><div className="evaluation-summary"><div><span className="eyebrow">Deterministic evaluation</span><h3>{result.passed ? "Ready for human calibration" : "Revise and resubmit"}</h3></div><span className={`gate-badge ${result.passed ? "passed" : "revision"}`}>{result.passed ? "Pass" : "Not yet"}</span></div><div className="rubric-results">{Object.entries(result.dimensions).map(([name, dimension]) => <article key={name}><header><strong>{name}</strong><span className={`band ${dimension.band.toLowerCase()}`}>{dimension.band}</span></header><ul>{dimension.evidence.map((item) => <li key={item}>{item}</li>)}</ul><p><strong>Next:</strong> {dimension.nextStep}</p></article>)}</div><button className="secondary-action" type="button" onClick={onRevise}>Revise submission <span>Return to fields</span></button><p className="provisional-note">Judgment-oriented scores are provisional until a facilitator reviews the artifact. The deterministic gate does not replace human calibration.</p></section>;
}
