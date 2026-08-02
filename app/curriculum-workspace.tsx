"use client";

import { useEffect, useMemo, useState } from "react";
import type { DeterministicEvalResult } from "./lib/attempt-types";
import type { ModelProvider, PersistedModelRun, ProviderStatus } from "./lib/model-run-types";
import type { CurriculumLab } from "./curriculum-data";

type GenericPayload = {
  draft: Record<string, string>;
  prompt: string;
  selectedSources: string[];
  verification: string;
  secondsRemaining: number;
};

type StoredLab = GenericPayload & { attemptId?: string; provider?: ModelProvider };

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function CurriculumWorkspace({ lab }: { lab: CurriculumLab }) {
  const storageKey = `upskill-ai-labs:${lab.id}`;
  const emptyDraft = useMemo(() => Object.fromEntries(lab.fields.map((field) => [field.key, ""])), [lab.fields]);
  const [draft, setDraft] = useState<Record<string, string>>(emptyDraft);
  const [prompt, setPrompt] = useState("");
  const [verification, setVerification] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [activeSourceId, setActiveSourceId] = useState(lab.sources[0].id);
  const [view, setView] = useState<"source" | "prompt">("source");
  const [secondsRemaining, setSecondsRemaining] = useState(25 * 60);
  const [runningTimer, setRunningTimer] = useState(false);
  const [attemptId, setAttemptId] = useState("");
  const [provider, setProvider] = useState<ModelProvider>("gemini");
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [modelRun, setModelRun] = useState<PersistedModelRun | null>(null);
  const [modelRunning, setModelRunning] = useState(false);
  const [modelError, setModelError] = useState("");
  const [evaluation, setEvaluation] = useState<DeterministicEvalResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const hydrate = window.setTimeout(async () => {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as StoredLab;
          setDraft({ ...emptyDraft, ...parsed.draft });
          setPrompt(parsed.prompt ?? "");
          setVerification(parsed.verification ?? "");
          setSelectedSources(parsed.selectedSources ?? []);
          setSecondsRemaining(parsed.secondsRemaining ?? 25 * 60);
          setAttemptId(parsed.attemptId ?? "");
          setProvider(parsed.provider ?? "gemini");
          if (parsed.attemptId) {
            const [attemptResponse, runResponse] = await Promise.all([
              fetch(`/api/attempts?id=${encodeURIComponent(parsed.attemptId)}`),
              fetch(`/api/model-runs?attemptId=${encodeURIComponent(parsed.attemptId)}`),
            ]);
            if (attemptResponse.ok) {
              const data = await attemptResponse.json() as { attempt: GenericPayload & { status: string }; evaluation: DeterministicEvalResult | null };
              setDraft({ ...emptyDraft, ...data.attempt.draft });
              setPrompt(data.attempt.prompt);
              setVerification(data.attempt.verification);
              setSelectedSources(data.attempt.selectedSources);
              setSecondsRemaining(data.attempt.secondsRemaining);
              setEvaluation(data.evaluation);
            }
            if (runResponse.ok) {
              const data = await runResponse.json() as { run: PersistedModelRun | null };
              setModelRun(data.run);
            }
          }
        } catch {
          // Start with a clean device-local draft when stored data is invalid.
        }
      }
      const response = await fetch("/api/model-runs?config=providers");
      if (response.ok) {
        const data = await response.json() as { providers: ProviderStatus[] };
        setProviders(data.providers);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrate);
  }, [emptyDraft, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify({
      attemptId, draft, prompt, verification, selectedSources, secondsRemaining, provider,
    } satisfies StoredLab));
  }, [attemptId, draft, hydrated, prompt, provider, secondsRemaining, selectedSources, storageKey, verification]);

  useEffect(() => {
    if (!runningTimer || secondsRemaining <= 0) return;
    const timer = window.setInterval(() => setSecondsRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [runningTimer, secondsRemaining]);

  function payload(): GenericPayload {
    return { draft, prompt, verification, selectedSources, secondsRemaining };
  }

  async function ensureAttempt() {
    if (attemptId) return attemptId;
    const response = await fetch("/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start", labId: lab.id }),
    });
    if (!response.ok) throw new Error("Unable to start this lab attempt");
    const data = await response.json() as { attempt: { id: string } };
    setAttemptId(data.attempt.id);
    return data.attempt.id;
  }

  async function saveAttempt() {
    setSaving(true);
    try {
      const id = await ensureAttempt();
      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", id, payload: payload() }),
      });
      if (!response.ok) throw new Error("Save failed");
    } finally {
      setSaving(false);
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
        body: JSON.stringify({ attemptId: id, provider, prompt, selectedSources }),
      });
      const data = await response.json() as { run?: PersistedModelRun; error?: string };
      if (!response.ok || !data.run) throw new Error(data.error ?? "Model execution failed");
      setModelRun(data.run);
    } catch (error) {
      setModelError(error instanceof Error ? error.message : "Model execution failed");
    } finally {
      setModelRunning(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const id = await ensureAttempt();
      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "submit", id, payload: payload() }),
      });
      const data = await response.json() as { result?: DeterministicEvalResult; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error ?? "Evaluation failed");
      setEvaluation(data.result);
      setRunningTimer(false);
    } finally {
      setSubmitting(false);
    }
  }

  const activeSource = lab.sources.find((source) => source.id === activeSourceId) ?? lab.sources[0];
  const completed = lab.fields.filter((field) => draft[field.key]?.trim()).length;
  const selectedProvider = providers.find((item) => item.provider === provider);

  return <main className="app-shell"><header className="topbar"><a className="brand" href="#curriculum"><span className="brand-mark">U</span><span>Upskill AI Labs</span></a><div className="lab-identity"><span className="eyebrow">Program manager pathway</span><strong>Lab {lab.number} of 6</strong></div><div className="session-status saved"><span className="status-dot" />{saving ? "Saving…" : attemptId ? "Durable attempt" : "Local draft"}</div></header><section className="brief-strip"><div><p className="eyebrow accent">{lab.play}</p><h1>{lab.title}</h1><p>{lab.brief}</p></div><div className="brief-actions"><button className="quiet-action" type="button" onClick={saveAttempt}>{saving ? "Saving…" : "Save"}</button><div className="timebox"><span>Timebox</span><strong>{formatTime(secondsRemaining)}</strong></div><button className="primary-action" type="button" onClick={() => setRunningTimer((value) => !value)}>{runningTimer ? "Pause" : secondsRemaining < 1500 ? "Resume" : "Begin lab"}</button></div></section><section className="workspace" aria-label={`${lab.title} workspace`}><aside className="source-rail"><div className="panel-heading"><div><span className="eyebrow">Evidence set</span><h2>Source library</h2></div><span className="count">{lab.sources.length}</span></div><nav>{lab.sources.map((item, index) => <button type="button" className={`source-item${view === "source" && activeSourceId === item.id ? " active" : ""}`} key={item.id} onClick={() => { setActiveSourceId(item.id); setView("source"); }}><span className="source-number">{String(index + 1).padStart(2, "0")}</span><span><strong>{item.title}</strong><small>{item.id} · {item.note}</small></span></button>)}</nav><button type="button" className={`prompt-entry${view === "prompt" ? " active" : ""}`} onClick={() => setView("prompt")}><span className="prompt-icon">↗</span><span><strong>AI workbench</strong><small>Run an evidence-bounded prompt</small></span></button><div className="policy-note"><span className="shield">◇</span><div><strong>Human decision boundary</strong><p>AI may structure and compare. You remain accountable for the deliverable.</p></div></div></aside>{view === "source" ? <article className="document-panel"><div className="document-meta"><div><span className="eyebrow">{activeSource.id}</span><h2>{activeSource.title}</h2></div><span className="classification internal">{activeSource.classification}</span></div><div className="document-body">{activeSource.sections.map((section, index) => <section key={index}>{section.heading && <h3>{section.heading}</h3>}{section.paragraphs?.map((text) => <p key={text}>{text}</p>)}{section.bullets && <ul>{section.bullets.map((text) => <li key={text}>{text}</li>)}</ul>}</section>)}</div></article> : <article className="document-panel prompt-panel"><div className="document-meta"><div><span className="eyebrow">AI surface</span><h2>Evidence workbench</h2></div><span className="classification internal">Policy bounded</span></div><label className="prompt-label">Provider<select value={provider} onChange={(event) => setProvider(event.target.value as ModelProvider)}>{providers.map((item) => <option key={item.provider} value={item.provider} disabled={!item.configured}>{item.label} · {item.model}{item.configured ? "" : " · key needed"}</option>)}</select></label><fieldset><legend>Sources supplied to AI</legend>{lab.sources.map((item) => <label className="source-check" key={item.id}><input type="checkbox" checked={selectedSources.includes(item.id)} onChange={() => setSelectedSources((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span><strong>{item.id}</strong><small>{item.title}</small></span></label>)}</fieldset><label className="prompt-label">Prompt notebook<textarea rows={10} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Define the output, citation, conflict, Unknown, and human-judgment rules…" /></label><button className="model-run-action" type="button" onClick={runModel} disabled={!prompt.trim() || !selectedSources.length || modelRunning || selectedProvider?.configured === false}>{modelRunning ? "Running…" : `Run with ${selectedProvider?.label ?? provider}`}<span>→</span></button>{modelError && <div className="model-error" role="alert"><strong>Model run unavailable</strong><p>{modelError}</p></div>}{modelRun && <section className="model-run-panel"><header><div><span className="eyebrow">Latest output · {modelRun.provider}</span><h3>{modelRun.model}</h3></div><span className="run-status">{modelRun.trace.status}</span></header><div className="model-output">{modelRun.outputText}</div><div className="meter-grid"><div><span>Input</span><strong>{modelRun.usage.inputTokens}</strong><small>tokens</small></div><div><span>Output</span><strong>{modelRun.usage.outputTokens}</strong><small>tokens</small></div><div><span>Total</span><strong>{modelRun.usage.totalTokens}</strong><small>tokens</small></div><div><span>Paid equiv.</span><strong>${(modelRun.cost.estimatedUsd ?? 0).toFixed(5)}</strong><small>USD</small></div></div></section>}</article>}<aside className="workbench-panel"><div className="panel-heading"><div><span className="eyebrow">Deliverable</span><h2>Your artifact</h2></div><span className="progress-label">{completed} / {lab.fields.length}</span></div><p className="deliverable-copy">{lab.deliverable}</p>{lab.fields.map((field) => <label key={field.key}>{field.label}{field.multiline ? <textarea rows={4} value={draft[field.key] ?? ""} onChange={(event) => { setDraft((current) => ({ ...current, [field.key]: event.target.value })); setEvaluation(null); }} /> : <input value={draft[field.key] ?? ""} onChange={(event) => { setDraft((current) => ({ ...current, [field.key]: event.target.value })); setEvaluation(null); }} />}</label>)}<label>Verification note<textarea rows={4} value={verification} onChange={(event) => setVerification(event.target.value)} placeholder="Record supplied sources, exclusions, conflicts, and human checks." /></label><button className="secondary-action" type="button" onClick={submit} disabled={completed < lab.fields.length || !verification.trim() || submitting}>{submitting ? "Evaluating…" : "Submit for review"}<span>{Math.round((completed / lab.fields.length) * 100)}%</span></button>{evaluation && <div className={`generic-evaluation ${evaluation.passed ? "passed" : "revision"}`}><strong>{evaluation.passed ? "Ready for facilitator review" : "Revision required"}</strong><p>{evaluation.summary}</p><ul>{Object.entries(evaluation.dimensions).map(([name, result]) => <li key={name}><span>{name}</span><b>{result.band}</b></li>)}</ul></div>}</aside></section></main>;
}
