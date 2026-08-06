"use client";

import { useState } from "react";
import type { DeterministicEvalResult } from "../lib/attempt-types";
import { errorMessage, post } from "../lib/client-api";
import { BandBadge, Button, Callout, Card, TextArea } from "./ui";

export function EvaluationPanel({
  result,
  submissionId,
  onRevise,
}: {
  result: DeterministicEvalResult;
  submissionId: string;
  onRevise: () => void;
}) {
  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="eyebrow mb-1.5">Deterministic evaluation</p>
          <h2 className="text-[24px] font-bold">{result.passed ? "Ready for human calibration" : "Revise and resubmit"}</h2>
        </div>
        <BandBadge band={result.passed ? "Strong" : "Developing"} />
      </div>

      <p className="m-0 max-w-[70ch] text-[15px] text-muted">{result.summary}</p>

      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(result.dimensions).map(([name, dimension]) => (
          <Card key={name} as="article" className="p-4">
            <header className="mb-2.5 flex items-center justify-between gap-3">
              <h3 className="text-[15px] font-bold capitalize">{name}</h3>
              <BandBadge band={dimension.band} />
            </header>
            {dimension.evidence.length ? (
              <ul className="m-0 mb-3 list-disc pl-5 text-[13px] leading-relaxed text-muted">
                {dimension.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            <p className="m-0 text-[13px] leading-relaxed">
              <span className="font-semibold">Next:</span> <span className="text-muted">{dimension.nextStep}</span>
            </p>
          </Card>
        ))}
      </div>

      <Callout tone="info">
        Judgment-oriented scores stay provisional until a facilitator calibrates them. The deterministic gate does not
        replace human review.
      </Callout>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onRevise}>Revise submission</Button>
        {submissionId ? <ScoreAppeal submissionId={submissionId} /> : null}
      </div>
    </section>
  );
}

function ScoreAppeal({ submissionId }: { submissionId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit() {
    setState("sending");
    setError("");
    try {
      await post("/api/evaluations", { action: "appeal", submissionId, rationale: reason });
      setState("sent");
    } catch (cause) {
      setError(errorMessage(cause, "Unable to file the appeal"));
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <p className="self-center text-[13px] font-semibold text-ok-fg" role="status">
        Appeal filed — a facilitator will review it.
      </p>
    );
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Appeal this score
      </Button>
    );
  }

  return (
    <Card className="w-full p-4">
      <TextArea
        label="Why is this score wrong?"
        hint="Goes to a human"
        rows={3}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Point to the evidence the evaluator missed…"
      />
      {error ? (
        <p className="mt-2 text-[13px] text-risk-fg" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button variant="primary" size="sm" onClick={() => void submit()} disabled={!reason.trim() || state === "sending"}>
          {state === "sending" ? "Filing…" : "File appeal"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
