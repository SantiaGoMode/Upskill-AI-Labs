"use client";

import { useState } from "react";
import type { ModelProvider, PersistedModelRun, ProviderStatus } from "../lib/model-run-types";
import type { Lab } from "../lib/labs";
import { isSourceAllowedForAi } from "../lib/labs";
import { errorMessage, formatCost, post } from "../lib/client-api";
import { Badge, Button, Callout, cx } from "./ui";

type RegressionCaseResult = {
  caseId: string;
  category: string;
  passed: boolean;
  output: string;
  missingExpected: string[];
  forbiddenMatches: string[];
};

type RegressionRun = {
  mode: "preview" | "live";
  result: {
    passed: number;
    total: number;
    criticalFailures: number;
    promotionReady: boolean;
    cases: RegressionCaseResult[];
  };
  cost: { estimatedUsd: number | null };
};

export function LabWorkbench({
  lab,
  prompt,
  onPromptChange,
  selectedSources,
  onToggleSource,
  provider,
  onProviderChange,
  providers,
  run,
  running,
  error,
  onRun,
  ensureAttempt,
}: {
  lab: Lab;
  prompt: string;
  onPromptChange: (value: string) => void;
  selectedSources: string[];
  onToggleSource: (id: string) => void;
  provider: ModelProvider;
  onProviderChange: (value: ModelProvider) => void;
  providers: ProviderStatus[];
  run: PersistedModelRun | null;
  running: boolean;
  error: string;
  onRun: () => void;
  ensureAttempt: () => Promise<string>;
}) {
  const active = providers.find((item) => item.provider === provider);
  const words = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;
  const canRun = Boolean(prompt.trim()) && selectedSources.length > 0 && !running && active?.configured !== false;

  return (
    <div className="px-6 py-6 md:px-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-line pb-5">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5">AI surface</p>
          <h2 className="text-[24px] font-bold">Prompt workbench</h2>
        </div>
        <Badge tone="ok">Policy bounded</Badge>
      </header>

      <Callout tone="warn" title="Build the boundary before the prompt." className="mb-6">
        {lab.workbenchNote}
      </Callout>

      <fieldset className="mb-6 border-0 p-0">
        <legend className="eyebrow mb-2.5">Model provider</legend>
        {providers.length === 0 ? (
          <p className="text-[14px] text-muted">Loading provider configuration…</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {providers.map((item) => (
              <button
                key={item.provider}
                type="button"
                onClick={() => onProviderChange(item.provider)}
                aria-pressed={provider === item.provider}
                className={cx(
                  "rounded-[10px] border px-3.5 py-3 text-left transition-colors",
                  provider === item.provider
                    ? "border-primary bg-inset ring-1 ring-primary"
                    : "border-line bg-bg hover:border-line-strong",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-bold">{item.label}</span>
                  <Badge tone={item.configured ? "ok" : "neutral"}>{item.configured ? "Ready" : "Key needed"}</Badge>
                </span>
                <span className="mt-1.5 block truncate font-mono text-[12px] text-muted">{item.model}</span>
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="mb-6 border-0 p-0">
        <legend className="eyebrow mb-2.5">Sources supplied to AI</legend>
        <div className="overflow-hidden rounded-[10px] border border-line">
          {lab.sources.map((source, index) => {
            const allowed = isSourceAllowedForAi(source);
            return (
              <label
                key={source.id}
                className={cx(
                  "flex cursor-pointer items-center gap-3 border-line px-3.5 py-3 text-[14px]",
                  index > 0 && "border-t",
                  !allowed && "cursor-not-allowed bg-risk-bg",
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={selectedSources.includes(source.id)}
                  disabled={!allowed}
                  onChange={() => onToggleSource(source.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[13px] font-semibold">{source.id}</span>
                  <span className={cx("mt-0.5 block text-[13px]", allowed ? "text-muted" : "font-semibold text-risk-fg")}>
                    {allowed ? source.title : "Blocked by policy — confidential data"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="block">
        <span className="eyebrow mb-2.5 block">Prompt</span>
        <textarea
          rows={10}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Define the output shape, citation rules, conflict handling, Unknown behaviour, and the boundary between AI drafting and human judgment…"
          className="w-full resize-y rounded-t-[10px] border border-line bg-bg p-3.5 font-mono text-[13px] leading-relaxed text-fg placeholder:text-subtle focus:border-primary focus:outline-none"
        />
      </label>
      <div className="-mt-px mb-4 flex items-center justify-between rounded-b-[10px] border border-line bg-inset px-3.5 py-2 text-[13px] text-muted">
        <span>
          {words} words · {selectedSources.length} source{selectedSources.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          className="font-semibold text-fg disabled:opacity-40"
          disabled={!prompt}
          onClick={() => void navigator.clipboard?.writeText(prompt)}
        >
          Copy
        </button>
      </div>

      <Button variant="primary" className="w-full" onClick={onRun} disabled={!canRun}>
        {running ? `Running with ${active?.label ?? provider}…` : `Run with ${active?.label ?? provider}`}
      </Button>

      {error ? (
        <Callout tone="risk" title="Model run unavailable" className="mt-4">
          {error}
        </Callout>
      ) : null}

      {run ? <ModelRunPanel run={run} /> : null}

      <BatchRunner prompt={prompt} provider={provider} ensureAttempt={ensureAttempt} />
    </div>
  );
}

function ModelRunPanel({ run }: { run: PersistedModelRun }) {
  return (
    <section className="mt-6 overflow-hidden rounded-[12px] border border-line bg-raised" aria-live="polite">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="eyebrow">Latest output · {run.provider}</p>
          <p className="mt-1 font-mono text-[13px] font-semibold">{run.model}</p>
        </div>
        <Badge tone="ok">{run.trace.status}</Badge>
      </header>

      <pre className="m-0 max-h-[380px] overflow-auto whitespace-pre-wrap px-4 py-4 font-mono text-[13px] leading-relaxed">
        {run.outputText}
      </pre>

      <dl className="grid grid-cols-2 border-t border-line sm:grid-cols-4">
        {[
          ["Input", run.usage.inputTokens.toLocaleString(), "tokens"],
          ["Output", run.usage.outputTokens.toLocaleString(), "tokens"],
          ["Total", run.usage.totalTokens.toLocaleString(), "tokens"],
          ["Est. cost", formatCost(run.cost.estimatedUsd), run.cost.estimatedUsd === null ? "no published rate" : "USD"],
        ].map(([label, value, hint], index) => (
          <div key={label} className={cx("border-line px-4 py-3", index % 2 === 1 && "border-l", index < 2 && "border-b sm:border-b-0", index > 0 && "sm:border-l")}>
            <dt className="eyebrow">{label}</dt>
            <dd className="m-0 mt-1 font-display text-[17px] font-bold tabular-nums">{value}</dd>
            <dd className="m-0 text-[12px] text-muted">{hint}</dd>
          </div>
        ))}
      </dl>

      <details className="border-t border-line">
        <summary className="cursor-pointer px-4 py-3 text-[13px] font-semibold">Execution trace</summary>
        <dl className="grid gap-2 px-4 pb-4 text-[13px]">
          {[
            ["Response", run.trace.responseId],
            ["Endpoint", run.trace.endpoint],
            ["Duration", `${(run.trace.durationMs / 1000).toFixed(2)}s`],
            ["Sources", run.trace.sourceIds.join(", ") || "—"],
            ["Completed", new Date(run.trace.completedAt).toLocaleString()],
            ["Pricing", run.cost.pricingBasis],
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[90px_1fr] gap-3">
              <dt className="text-muted">{label}</dt>
              <dd className="m-0 break-words font-mono text-[12px]">{value}</dd>
            </div>
          ))}
        </dl>
      </details>

      <p className="m-0 border-t border-line px-4 py-3 text-[13px] text-muted">
        Model output is evidence to inspect, not an approved answer. Verify material claims before moving them into your artifact.
      </p>
    </section>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  baseline: "Baseline",
  "missing-source": "Missing source",
  "numerical-conflict": "Conflict",
  "prompt-injection": "Injection",
  "restricted-data": "Restricted",
};

/**
 * The 20-case batch runner. The blueprint calls this the signature moment of
 * the product — the point where a prompt that worked once is shown failing
 * 6 times out of 20 — so it is a first-class panel, not a collapsed detail.
 */
function BatchRunner({
  prompt,
  provider,
  ensureAttempt,
}: {
  prompt: string;
  provider: ModelProvider;
  ensureAttempt: () => Promise<string>;
}) {
  const [run, setRun] = useState<RegressionRun | null>(null);
  const [busy, setBusy] = useState<"preview" | "live" | null>(null);
  const [error, setError] = useState("");

  async function execute(mode: "preview" | "live") {
    setBusy(mode);
    setError("");
    try {
      const attemptId = await ensureAttempt();
      const data = await post<{ run: RegressionRun }>("/api/regression-runs", { attemptId, prompt, provider, mode });
      setRun(data.run);
    } catch (cause) {
      setError(errorMessage(cause, "Regression run failed"));
    } finally {
      setBusy(null);
    }
  }

  const summary = run?.result;

  return (
    <section className="mt-6 rounded-[12px] border border-line bg-inset p-5">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5">Reliability</p>
          <h3 className="text-[18px] font-bold">Run this prompt against 20 cases</h3>
          <p className="mt-1.5 max-w-[56ch] text-[13px] text-muted">
            Six clean baselines, five missing sources, four numerical conflicts, three prompt injections, and two
            restricted-data cases. A prompt that works once is not yet a workflow.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void execute("preview")} disabled={!prompt.trim() || busy !== null}>
            {busy === "preview" ? "Checking…" : "Dry check"}
          </Button>
          <Button size="sm" variant="primary" onClick={() => void execute("live")} disabled={!prompt.trim() || busy !== null}>
            {busy === "live" ? "Running 20…" : "Run live"}
          </Button>
        </div>
      </header>

      {error ? (
        <Callout tone="risk" className="mt-3">
          {error}
        </Callout>
      ) : null}

      {summary ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-[10px] border border-line bg-raised px-4 py-3">
            <p className="m-0 font-display text-[26px] font-bold tabular-nums">
              {summary.passed}
              <span className="text-[16px] font-semibold text-muted">/{summary.total}</span>
            </p>
            <div className="min-w-0 flex-1 text-[13px] text-muted">
              <p className="m-0">
                {run?.mode === "preview" ? "Dry check — prompt rules only, no model calls." : "Live batch against the model."}
              </p>
              {summary.criticalFailures > 0 ? (
                <p className="m-0 font-semibold text-risk-fg">
                  {summary.criticalFailures} critical failure{summary.criticalFailures === 1 ? "" : "s"} (injection or restricted data)
                </p>
              ) : null}
            </div>
            <Badge tone={summary.promotionReady ? "ok" : "warn"}>
              {summary.promotionReady ? "Promotion ready" : "Not promotable"}
            </Badge>
            {run?.mode === "live" ? <span className="text-[13px] text-muted">{formatCost(run.cost.estimatedUsd)}</span> : null}
          </div>

          <ul className="mt-3 grid list-none grid-cols-2 gap-1.5 p-0 sm:grid-cols-4 lg:grid-cols-5">
            {summary.cases.map((item) => (
              <li
                key={item.caseId}
                title={`${item.caseId} · ${CATEGORY_LABELS[item.category] ?? item.category}${
                  item.passed ? "" : ` · missing: ${item.missingExpected.join(", ") || "—"}`
                }`}
                className={cx(
                  "rounded-[7px] border px-2 py-1.5 text-[12px] font-semibold",
                  item.passed ? "border-ok-line bg-ok-bg text-ok-fg" : "border-risk-line bg-risk-bg text-risk-fg",
                )}
              >
                <span className="block font-mono">{item.caseId.replace("NW-REG-", "")}</span>
                <span className="block truncate font-normal opacity-80">{CATEGORY_LABELS[item.category] ?? item.category}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-[13px] text-muted">
          Dry check compares your prompt against each case&rsquo;s required rule without calling a model. Run live to see
          real failure rates.
        </p>
      )}
    </section>
  );
}
