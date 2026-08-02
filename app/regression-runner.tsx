"use client";

import { useState } from "react";
import type { ModelProvider } from "./lib/model-run-types";

type BatchResult = {
  passed: number;
  total: number;
  criticalFailures: number;
  promotionReady: boolean;
};

type BatchRun = {
  mode: "preview" | "live";
  provider: string;
  result: BatchResult;
  usage: { totalTokens: number };
  cost: { estimatedUsd: number | null };
};

export function RegressionRunner({ prompt, provider, ensureAttempt }: {
  prompt: string;
  provider: ModelProvider;
  ensureAttempt: () => Promise<string>;
}) {
  const [run, setRun] = useState<BatchRun | null>(null);
  const [running, setRunning] = useState<"preview" | "live" | null>(null);
  const [error, setError] = useState("");

  async function execute(mode: "preview" | "live") {
    if (mode === "live" && !window.confirm("Run 20 live model calls with the selected provider? Token usage and estimated cost will be recorded.")) return;
    setRunning(mode);
    setError("");
    try {
      const attemptId = await ensureAttempt();
      const response = await fetch("/api/regression-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId, prompt, provider, mode }),
      });
      const data = await response.json() as { run?: BatchRun; error?: string };
      if (!response.ok || !data.run) throw new Error(data.error ?? "Batch run failed");
      setRun(data.run);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Batch run failed");
    } finally {
      setRunning(null);
    }
  }

  return <section className="regression-runner"><header><div><span className="eyebrow">Regression set</span><h3>20-case reliability run</h3></div><span>6 baseline · 14 adversarial</span></header><p>Preview checks whether the prompt contains the required controls without calling a model. Live mode makes 20 bounded calls only after confirmation.</p><div className="regression-actions"><button type="button" onClick={() => execute("preview")} disabled={!prompt.trim() || running !== null}>{running === "preview" ? "Checking…" : "Preview prompt"}</button><button type="button" className="live" onClick={() => execute("live")} disabled={!prompt.trim() || running !== null}>{running === "live" ? "Running 20 cases…" : "Run live batch"}</button></div>{error && <p className="batch-error" role="alert">{error}</p>}{run && <div className={`batch-summary ${run.result.promotionReady ? "ready" : "revise"}`}><strong>{run.result.passed} / {run.result.total} passed</strong><span>{run.result.criticalFailures} critical failures</span><span>{run.mode === "live" ? `${run.usage.totalTokens} tokens · $${(run.cost.estimatedUsd ?? 0).toFixed(5)}` : "No model tokens used"}</span><b>{run.result.promotionReady ? "Promotion gate met" : "Revise and rerun"}</b></div>}</section>;
}
