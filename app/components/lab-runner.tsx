"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeterministicEvalResult } from "../lib/attempt-types";
import type { ModelProvider, PersistedModelRun, ProviderStatus } from "../lib/model-run-types";
import {
  completedFieldCount,
  emptyDraftFor,
  isSourceAllowedForAi,
  labs,
  labShortTitle,
  LAB_TIMEBOX_SECONDS,
  type Lab,
} from "../lib/labs";
import { api, errorMessage, formatClock, isViewer, post, useIdentity } from "../lib/client-api";
import { moduleForLab } from "../content/course";
import { Badge, Button, Callout, Card, cx, LinkButton, Meter, Spinner } from "./ui";
import { ArtifactViewer } from "./artifact-viewer";
import {
  BriefStage,
  DeliverableField,
  OutputReference,
  PreflightPanel,
  StageBar,
  type PreflightCheck,
  type Stage,
} from "./lab-stages";
import { LabWorkbench } from "./lab-workbench";
import { EvaluationPanel } from "./lab-evaluation";

type SaveState = "local" | "saving" | "saved" | "error";

type StoredLab = {
  attemptId?: string;
  draft: Record<string, string>;
  prompt: string;
  verification: string;
  selectedSources: string[];
  provider?: ModelProvider;
  secondsRemaining: number;
  reviewed?: string[];
};

type AttemptResponse = {
  attempt: { draft: Record<string, string>; prompt: string; verification: string; selectedSources: string[]; secondsRemaining: number; status: string };
  evaluation: DeterministicEvalResult | null;
  submissionId: string | null;
};

export function LabRunner({ lab }: { lab: Lab }) {
  const { identity, loading } = useIdentity();
  if (loading) return <div className="mx-auto w-full max-w-[1180px] px-6 py-10"><Spinner label="Loading lab…" /></div>;
  if (isViewer(identity)) return <ReadOnlyLabPreview lab={lab} />;
  return <InteractiveLabRunner lab={lab} />;
}

function ReadOnlyLabPreview({ lab }: { lab: Lab }) {
  const [activeSourceId, setActiveSourceId] = useState(lab.sources[0]?.id ?? "");
  const activeSource = lab.sources.find((source) => source.id === activeSourceId) ?? lab.sources[0];
  const currentIndex = labs.findIndex((item) => item.id === lab.id);
  const previous = currentIndex > 0 ? labs[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < labs.length - 1 ? labs[currentIndex + 1] : null;
  const context = moduleForLab(lab.id);

  return (
    <div className="flex min-h-[calc(100dvh-60px)] flex-col">
      <LabRail currentId={lab.id} />
      <section className="bg-forest px-6 py-7 text-white md:px-8">
        <div className="mx-auto w-full max-w-[1180px]">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="warn">Read-only demo</Badge>
            <span className="font-mono text-[12px] opacity-80">Lab {lab.number} of {labs.length} · {lab.play}</span>
          </div>
          <h1 className="text-[clamp(26px,3.2vw,40px)] font-bold">{lab.title}</h1>
          <p className="mt-3 max-w-[72ch] text-[15px] leading-relaxed text-white/80">{lab.summary}</p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1180px] px-6 py-8 md:px-8">
        <Callout tone="info">
          You can inspect the brief and every source artifact. Timers, drafting, model runs, submissions, and progress updates require an assigned account.
        </Callout>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <p className="eyebrow mb-2">The situation</p>
            <p className="m-0 text-[15px] leading-relaxed">{lab.brief}</p>
          </Card>
          <Card className="p-5">
            <p className="eyebrow mb-2">What the learner hands in</p>
            <p className="m-0 text-[15px] leading-relaxed">{lab.deliverable}</p>
          </Card>
        </div>

        {lab.steps.length ? (
          <section className="mt-8">
            <h2 className="mb-3 text-[20px] font-bold">How the lab works</h2>
            <ol className="grid list-none gap-2 p-0 md:grid-cols-2">
              {lab.steps.map((step, index) => (
                <Card as="li" key={step} className="grid grid-cols-[28px_1fr] gap-3 px-4 py-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-inset text-[12px] font-bold text-muted">{index + 1}</span>
                  <span className="text-[14px] leading-relaxed">{step}</span>
                </Card>
              ))}
            </ol>
          </section>
        ) : null}

        <section className="mt-8 overflow-hidden rounded-[12px] border border-line bg-raised">
          <header className="border-b border-line px-5 py-4">
            <p className="eyebrow mb-1">Evidence pack</p>
            <h2 className="text-[20px] font-bold">View the existing demo artifacts</h2>
          </header>
          <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
            <nav aria-label="Lab sources" className="grid content-start gap-1 border-b border-line bg-inset p-3 lg:border-b-0 lg:border-r">
              {lab.sources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => setActiveSourceId(source.id)}
                  aria-current={activeSource?.id === source.id ? "page" : undefined}
                  className={cx(
                    "rounded-[8px] px-3 py-2.5 text-left",
                    activeSource?.id === source.id ? "bg-raised shadow-[inset_3px_0_var(--accent)]" : "hover:bg-raised/60",
                  )}
                >
                  <span className="block font-mono text-[11px] text-subtle">{source.id}</span>
                  <span className="mt-0.5 block text-[13px] font-semibold">{source.title}</span>
                </button>
              ))}
            </nav>
            <div className="min-w-0">{activeSource ? <ArtifactViewer source={activeSource} /> : null}</div>
          </div>
        </section>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          <div className="flex flex-wrap gap-2">
            {previous ? <LinkButton variant="ghost" href={`/lab/${previous.id}`}>← Previous lab</LinkButton> : null}
            {context ? <LinkButton variant="ghost" href={`/course/${context.courseModule.id}`}>Back to module</LinkButton> : null}
          </div>
          {next ? <LinkButton variant="primary" href={`/lab/${next.id}`}>Next lab →</LinkButton> : <LinkButton variant="primary" href="/course">Back to course</LinkButton>}
        </div>
      </div>
    </div>
  );
}

function InteractiveLabRunner({ lab }: { lab: Lab }) {
  const storageKey = `upskill-ai-labs:${lab.id}`;
  const blankDraft = useMemo(() => emptyDraftFor(lab), [lab]);

  const [draft, setDraft] = useState<Record<string, string>>(blankDraft);
  const [prompt, setPrompt] = useState("");
  const [verification, setVerification] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [activeSourceId, setActiveSourceId] = useState(lab.sources[0]?.id ?? "");
  const [stage, setStage] = useState<Stage>("brief");
  const [reviewed, setReviewed] = useState<string[]>([]);

  const [secondsRemaining, setSecondsRemaining] = useState(LAB_TIMEBOX_SECONDS);
  const [timerRunning, setTimerRunning] = useState(false);

  const [attemptId, setAttemptId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [evaluation, setEvaluation] = useState<DeterministicEvalResult | null>(null);
  const [submissionId, setSubmissionId] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("local");

  const [provider, setProvider] = useState<ModelProvider>("gemini");
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [modelRun, setModelRun] = useState<PersistedModelRun | null>(null);
  const [modelRunning, setModelRunning] = useState(false);
  const [modelError, setModelError] = useState("");

  const [hydrated, setHydrated] = useState(false);
  const [fatalError, setFatalError] = useState("");

  /** Mirrors current state for callbacks that must not re-create on every keystroke. */
  const latest = useRef({ draft, prompt, verification, selectedSources, secondsRemaining });
  useEffect(() => {
    latest.current = { draft, prompt, verification, selectedSources, secondsRemaining };
  });

  /** Lets the autosave effect start an attempt without depending on the callback identity. */
  const ensureAttemptRef = useRef<() => Promise<string>>(async () => "");

  const payload = useCallback(
    () => ({
      draft: latest.current.draft,
      prompt: latest.current.prompt,
      verification: latest.current.verification,
      selectedSources: latest.current.selectedSources,
      secondsRemaining: latest.current.secondsRemaining,
    }),
    [],
  );

  /* ---------------------------------------------------------------- hydrate */
  // The page keys this component by lab id, so a mount is always a fresh lab and
  // no reset pass is needed. Work is deferred past the effect body so the local
  // draft read and the state it produces never run synchronously during commit.
  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      let storedAttemptId = "";
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as StoredLab;
          if (cancelled) return;
          setDraft({ ...blankDraft, ...parsed.draft });
          setPrompt(parsed.prompt ?? "");
          setVerification(parsed.verification ?? "");
          setSelectedSources(parsed.selectedSources ?? []);
          setSecondsRemaining(parsed.secondsRemaining ?? LAB_TIMEBOX_SECONDS);
          setProvider(parsed.provider ?? "gemini");
          setReviewed(parsed.reviewed ?? []);
          storedAttemptId = parsed.attemptId ?? "";
          setAttemptId(storedAttemptId);
        }
      } catch {
        // A corrupt local draft should never block the lab; start clean instead.
      }

      if (storedAttemptId) {
        try {
          const [attemptData, runData] = await Promise.all([
            api<AttemptResponse>(`/api/attempts?id=${encodeURIComponent(storedAttemptId)}`),
            api<{ run: PersistedModelRun | null }>(`/api/model-runs?attemptId=${encodeURIComponent(storedAttemptId)}`).catch(() => ({ run: null })),
          ]);
          if (cancelled) return;
          setDraft({ ...blankDraft, ...attemptData.attempt.draft });
          setPrompt(attemptData.attempt.prompt);
          setVerification(attemptData.attempt.verification);
          setSelectedSources(attemptData.attempt.selectedSources);
          setSecondsRemaining(attemptData.attempt.secondsRemaining);
          setSubmitted(attemptData.attempt.status === "submitted");
          setEvaluation(attemptData.evaluation);
          setSubmissionId(attemptData.submissionId ?? "");
          setModelRun(runData.run);
          setSaveState("saved");
          if (attemptData.evaluation) setStage("submit");
        } catch {
          // The stored attempt no longer resolves (different account, cleared DB).
          if (!cancelled) setAttemptId("");
        }
      }

      try {
        const config = await api<{ providers: ProviderStatus[] }>("/api/model-runs?config=providers");
        if (!cancelled) setProviders(config.providers);
      } catch (cause) {
        if (!cancelled) setFatalError(errorMessage(cause, "Unable to load provider configuration"));
      }

      if (!cancelled) setHydrated(true);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [blankDraft, storageKey]);

  /* --------------------------------------------------------- local persistence */
  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      const stored: StoredLab = { attemptId, draft, prompt, verification, selectedSources, provider, secondsRemaining, reviewed };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(stored));
      } catch {
        // Storage quota or private mode — the server copy is the durable one.
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [attemptId, draft, hydrated, prompt, provider, reviewed, secondsRemaining, selectedSources, storageKey, verification]);

  /* -------------------------------------------------------- server autosave */
  // The first real edit promotes the local draft into a durable attempt, so work
  // survives a refresh even if the learner never pressed "Begin lab".
  const hasLearnerContent =
    Boolean(prompt.trim()) ||
    Boolean(verification.trim()) ||
    selectedSources.length > 0 ||
    lab.fields.some((field) => (draft[field.key] ?? "").trim() !== (blankDraft[field.key] ?? ""));

  useEffect(() => {
    if (!hydrated || submitted) return;
    if (!attemptId && !hasLearnerContent) return;
    const timeout = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const id = await ensureAttemptRef.current();
        await post("/api/attempts", { action: "save", id, payload: payload() });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [attemptId, draft, hasLearnerContent, hydrated, payload, prompt, secondsRemaining, selectedSources, submitted, verification]);

  /* ------------------------------------------------------------------ timer */
  useEffect(() => {
    if (!timerRunning || secondsRemaining <= 0) return;
    const interval = window.setInterval(() => setSecondsRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning, secondsRemaining]);

  /* ---------------------------------------------------------------- actions */
  const ensureAttempt = useCallback(async () => {
    if (attemptId) return attemptId;
    const data = await post<{ attempt: { id: string } }>("/api/attempts", { action: "start", labId: lab.id });
    setAttemptId(data.attempt.id);
    setSaveState("saved");
    return data.attempt.id;
  }, [attemptId, lab.id]);

  useEffect(() => {
    ensureAttemptRef.current = ensureAttempt;
  }, [ensureAttempt]);

  async function toggleTimer() {
    if (!timerRunning) {
      try {
        await ensureAttempt();
      } catch {
        setSaveState("error");
      }
    }
    setTimerRunning((running) => !running);
  }

  async function runModel() {
    setModelRunning(true);
    setModelError("");
    try {
      const id = await ensureAttempt();
      const data = await post<{ run: PersistedModelRun }>("/api/model-runs", {
        attemptId: id,
        provider,
        prompt,
        selectedSources,
      });
      setModelRun(data.run);
    } catch (cause) {
      setModelError(errorMessage(cause, "Model execution failed"));
    } finally {
      setModelRunning(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const id = await ensureAttempt();
      const data = await post<{ submissionId: string; result: DeterministicEvalResult }>("/api/attempts", {
        action: "submit",
        id,
        payload: payload(),
      });
      setEvaluation(data.result);
      setSubmissionId(data.submissionId);
      setSubmitted(true);
      setTimerRunning(false);
      setSaveState("saved");
    } catch (cause) {
      setModelError(errorMessage(cause, "Submission could not be evaluated"));
    } finally {
      setSubmitting(false);
    }
  }

  function updateField(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (evaluation) {
      setEvaluation(null);
      setSubmitted(false);
    }
  }

  function toggleSource(id: string) {
    setSelectedSources((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function reset() {
    if (!window.confirm("Reset this attempt? The locally saved draft is removed. Submitted work stays in your record.")) return;
    window.localStorage.removeItem(storageKey);
    setDraft(blankDraft);
    setPrompt("");
    setVerification("");
    setSelectedSources([]);
    setSecondsRemaining(LAB_TIMEBOX_SECONDS);
    setTimerRunning(false);
    setAttemptId("");
    setSubmitted(false);
    setEvaluation(null);
    setSubmissionId("");
    setModelRun(null);
    setModelError("");
    setSaveState("local");
    setReviewed([]);
    setStage("brief");
  }

  /* ------------------------------------------------------------------ derived */
  const completed = completedFieldCount(lab, draft);
  const total = lab.fields.length;
  const activeSource = lab.sources.find((source) => source.id === activeSourceId) ?? lab.sources[0];
  const sourceIds = lab.sources.map((source) => source.id);
  const allText = `${Object.values(draft).join(" ")} ${verification}`;
  const citedCount = sourceIds.filter((id) => allText.includes(id)).length;
  const unknownCount = Object.values(draft).filter((value) => /^unknown\b/i.test(value.trim())).length;
  const confidentialSupplied = selectedSources.some((id) => {
    const source = lab.sources.find((item) => item.id === id);
    return source ? !isSourceAllowedForAi(source) : false;
  });
  // 15 words clears Developing on Efficiency in both evaluators (lab-01 needs 15,
  // the curriculum labs 10), so it is the honest bar to warn against.
  const promptWords = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;

  const preflight: PreflightCheck[] = [
    {
      label: "Every field completed",
      passed: completed === total,
      detail: completed === total ? `${total} of ${total} complete` : `${total - completed} still empty. Use Unknown where evidence is absent.`,
      blocking: true,
    },
    {
      label: "Verification note written",
      passed: Boolean(verification.trim()),
      detail: verification.trim() ? "Recorded with the submission" : "Record what you supplied, withheld, and checked by hand.",
      blocking: true,
    },
    {
      label: "No confidential source sent to AI",
      passed: !confidentialSupplied,
      detail: confidentialSupplied ? "A confidential source is ticked in the workbench. Remove it." : "The data boundary is intact.",
      blocking: true,
    },
    {
      label: "Extraction prompt recorded",
      passed: promptWords >= 15 && selectedSources.length > 0,
      detail:
        promptWords === 0
          ? "No prompt yet. Efficiency is scored on it, and an empty prompt lands at Developing."
          : selectedSources.length === 0
            ? `${promptWords} words, but no permitted source was supplied to the model.`
            : promptWords < 15
              ? `${promptWords} words. State the Unknown, citation and human-decision rules to clear Developing.`
              : `${promptWords} words across ${selectedSources.length} permitted source${selectedSources.length === 1 ? "" : "s"}.`,
      blocking: false,
    },
    {
      label: "Material claims cite a source",
      passed: citedCount >= 3,
      detail: `${citedCount} distinct source ID${citedCount === 1 ? "" : "s"} appear in your artifact. Grounding scores on this.`,
      blocking: false,
    },
    {
      label: "Gaps marked Unknown",
      passed: unknownCount > 0,
      detail: unknownCount > 0 ? `${unknownCount} field${unknownCount === 1 ? "" : "s"} marked Unknown` : "No Unknowns. Check nothing was filled in from assumption.",
      blocking: false,
    },
  ];

  const readyToSubmit = !preflight.some((check) => check.blocking && !check.passed);

  const stageDone: Record<Stage, boolean> = {
    brief: stage !== "brief",
    evidence: reviewed.length >= lab.sources.length,
    workbench: Boolean(modelRun) || Boolean(prompt.trim()),
    draft: completed === total,
    submit: Boolean(evaluation),
  };

  const context = moduleForLab(lab.id);
  const moduleHref = context ? `/course/${context.courseModule.id}` : null;

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved to lab record"
        : saveState === "error"
          ? "Server unavailable · draft is local"
          : "Local draft";

  function toggleReviewed(id: string) {
    setReviewed((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="flex min-h-[calc(100dvh-60px)] flex-col">
      <LabRail currentId={lab.id} />

      {/* Brief */}
      <section className="bg-forest px-6 py-7 text-white md:px-8">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div className="min-w-0 max-w-[70ch]">
            <p className="eyebrow !text-[color:var(--brand-mint)]">
              Lab {lab.number} of {labs.length} · {lab.play} · {lab.scenario}
            </p>
            <h1 className="mt-2 text-[clamp(26px,3.2vw,40px)] font-bold">{lab.title}</h1>
          </div>
          <div className="flex shrink-0 items-end gap-5">
            <div>
              <p className="eyebrow !text-[color:var(--brand-mint)]">Timebox</p>
              <p className="mt-1 font-display text-[30px] font-bold tabular-nums" aria-live="polite">
                {formatClock(secondsRemaining)}
              </p>
            </div>
            <Button variant="accent" onClick={() => void toggleTimer()}>
              {timerRunning ? "Pause" : secondsRemaining < LAB_TIMEBOX_SECONDS ? "Resume" : "Begin lab"}
            </Button>
          </div>
        </div>
      </section>

      <StageBar stage={stage} onChange={setStage} done={stageDone} />

      {/* Status strip */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line bg-inset px-6 py-2 md:px-8">
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <span
            aria-hidden
            className={cx("h-2 w-2 rounded-full", saveState === "error" ? "bg-risk-fg" : saveState === "saving" ? "bg-gold" : "bg-ok-fg")}
          />
          {saveLabel}
        </p>
        <div className="flex items-center gap-3">
          <p className="text-[13px] text-muted tabular-nums">
            {completed}/{total} fields · {reviewed.length}/{lab.sources.length} sources read
          </p>
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset attempt
          </Button>
        </div>
      </div>

      {fatalError ? (
        <div className="px-6 pt-4 md:px-8">
          <Callout tone="risk" title="Configuration problem">
            {fatalError}
          </Callout>
        </div>
      ) : null}

      {stage === "brief" ? <BriefStage lab={lab} moduleHref={moduleHref} onStart={() => setStage("evidence")} /> : null}

      {stage === "evidence" ? (
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b border-line bg-inset px-4 py-5 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-center justify-between px-2">
              <p className="eyebrow">Evidence set</p>
              <Badge tone={reviewed.length === lab.sources.length ? "ok" : "neutral"}>
                {reviewed.length}/{lab.sources.length}
              </Badge>
            </div>
            <nav aria-label="Lab sources" className="grid gap-0.5">
              {lab.sources.map((source, index) => {
                const active = activeSourceId === source.id;
                const isRead = reviewed.includes(source.id);
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => setActiveSourceId(source.id)}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "grid grid-cols-[24px_1fr] gap-2 rounded-[8px] px-2 py-2.5 text-left transition-colors",
                      active ? "bg-raised shadow-[inset_3px_0_var(--accent)]" : "hover:bg-raised/60",
                    )}
                  >
                    <span className={cx("font-mono text-[12px]", isRead ? "text-ok-fg" : "text-subtle")}>
                      {isRead ? "✓" : String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{source.title}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-muted">{source.note}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
            <div className="mt-4 rounded-[10px] border border-ok-line bg-ok-bg px-3 py-3">
              <p className="text-[13px] font-bold text-ok-fg">Human decision boundary</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ok-fg opacity-90">
                AI may structure and compare. You stay accountable for the deliverable.
              </p>
            </div>
            <Button variant="primary" className="mt-4 w-full" onClick={() => setStage("workbench")}>
              Go to the workbench →
            </Button>
          </aside>

          <div className="min-w-0 bg-raised">
            {activeSource ? (
              <ArtifactViewer
                source={activeSource}
                reviewed={reviewed.includes(activeSource.id)}
                onToggleReviewed={() => toggleReviewed(activeSource.id)}
                onCite={(id) => void navigator.clipboard?.writeText(`[${id}]`)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {stage === "workbench" ? (
        <div className="mx-auto w-full max-w-[900px]">
          <LabWorkbench
            lab={lab}
            prompt={prompt}
            onPromptChange={setPrompt}
            selectedSources={selectedSources}
            onToggleSource={toggleSource}
            provider={provider}
            onProviderChange={setProvider}
            providers={providers}
            run={modelRun}
            running={modelRunning}
            error={modelError}
            onRun={() => void runModel()}
            ensureAttempt={ensureAttempt}
          />
          <div className="flex justify-between gap-3 border-t border-line px-6 py-5 md:px-8">
            <Button variant="ghost" onClick={() => setStage("evidence")}>
              ← Evidence
            </Button>
            <Button variant="primary" onClick={() => setStage("draft")}>
              Write the deliverable →
            </Button>
          </div>
        </div>
      ) : null}

      {stage === "draft" ? (
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 px-6 py-6 md:px-8">
            <header className="mb-5 border-b border-line pb-4">
              <p className="eyebrow mb-1.5">Your deliverable</p>
              <h2 className="text-[22px] font-bold">{lab.title}</h2>
              <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-muted">{lab.deliverable}</p>
            </header>
            <div className="grid gap-3 xl:grid-cols-2">
              {lab.fields.map((field) => (
                <div key={field.key} className={cx(field.kind === "textarea" && "xl:col-span-2")}>
                  <DeliverableField field={field} value={draft[field.key] ?? ""} onChange={updateField} sourceIds={sourceIds} />
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-line pt-5">
              <Button variant="ghost" onClick={() => setStage("workbench")}>
                ← Workbench
              </Button>
              <Button variant="primary" onClick={() => setStage("submit")}>
                Verify and submit →
              </Button>
            </div>
          </div>

          <aside className="border-t border-line bg-inset px-5 py-5 lg:border-l lg:border-t-0">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <p className="eyebrow">Progress</p>
              <span className="text-[13px] text-muted tabular-nums">
                {completed}/{total}
              </span>
            </div>
            <Meter value={completed} total={total} />
            <div className="mt-4">
              <OutputReference run={modelRun} onOpenWorkbench={() => setStage("workbench")} />
            </div>
            <div className="mt-4">
              <PreflightPanel checks={preflight} />
            </div>
            {moduleHref ? (
              <p className="mt-4 text-[13px] leading-relaxed text-muted">
                Stuck? The{" "}
                <a href={moduleHref} className="font-semibold text-fg underline">
                  worked example
                </a>{" "}
                in this module shows the same deliverable done well.
              </p>
            ) : null}
          </aside>
        </div>
      ) : null}

      {stage === "submit" ? (
        <div className="mx-auto w-full max-w-[860px] px-6 py-7 md:px-8">
          {evaluation ? (
            <EvaluationPanel
              result={evaluation}
              submissionId={submissionId}
              onRevise={() => {
                setEvaluation(null);
                setSubmitted(false);
                setStage("draft");
              }}
            />
          ) : (
            <>
              <header className="mb-5 border-b border-line pb-4">
                <p className="eyebrow mb-1.5">Final step</p>
                <h2 className="text-[24px] font-bold">Verify, then hand it in</h2>
              </header>

              <PreflightPanel checks={preflight} />

              <label className="mt-6 block">
                <span className="mb-1.5 block text-[14px] font-bold">Verification note</span>
                <span className="mb-2 block text-[13px] leading-relaxed text-muted">
                  This is graded. Record which sources you supplied to AI, what you withheld and why, any conflicts you
                  found, and what you checked by hand.
                </span>
                <textarea
                  rows={6}
                  value={verification}
                  onChange={(event) => setVerification(event.target.value)}
                  placeholder="I supplied NW-… and withheld NW-… because it is confidential. I found a conflict between … and …. I checked every date against …"
                  className="w-full resize-y rounded-[8px] border border-line bg-raised px-3 py-2.5 text-[14px] leading-relaxed placeholder:text-subtle focus:border-primary focus:outline-none"
                />
              </label>

              {modelError ? (
                <Callout tone="risk" className="mt-4">
                  {modelError}
                </Callout>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                <Button variant="ghost" onClick={() => setStage("draft")}>
                  ← Back to the draft
                </Button>
                <Button variant="primary" onClick={() => void submit()} disabled={!readyToSubmit || submitting}>
                  {submitting ? "Evaluating…" : "Submit for review"}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function LabRail({ currentId }: { currentId: string }) {
  const context = moduleForLab(currentId);
  return (
    <nav aria-label="Curriculum" className="border-b border-line bg-raised">
      {context ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2">
          <p className="m-0 text-[13px] text-muted">
            <Link href="/course" className="font-semibold text-fg hover:underline">
              Course
            </Link>
            <span aria-hidden className="mx-2">
              ›
            </span>
            <Link href={`/course/${context.courseModule.id}`} className="hover:underline">
              Module {context.courseModule.number} · {context.courseModule.title}
            </Link>
          </p>
          <Link href={`/course/${context.courseModule.id}`} className="text-[13px] font-semibold text-fg hover:underline">
            Back to module →
          </Link>
        </div>
      ) : null}
      <div className="flex gap-1 overflow-x-auto px-4 py-2">
        {labs.map((lab) => {
          const active = lab.id === currentId;
          return (
            <Link
              key={lab.id}
              href={`/lab/${lab.id}`}
              aria-current={active ? "page" : undefined}
              className={cx(
                "min-w-[112px] shrink-0 rounded-[8px] px-3 py-2 transition-colors",
                active ? "bg-primary text-primary-fg" : "text-muted hover:bg-inset hover:text-fg",
              )}
            >
              <span className={cx("block font-mono text-[11px]", active ? "opacity-75" : "text-subtle")}>
                {String(lab.number).padStart(2, "0")}
              </span>
              <span className="mt-0.5 block truncate text-[13px] font-semibold">{labShortTitle(lab)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
