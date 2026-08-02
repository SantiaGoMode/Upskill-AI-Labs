"use client";

import { useState } from "react";

export function ScoreAppeal({ submissionId }: { submissionId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "submitted">("idle");
  const [error, setError] = useState("");

  async function submit() {
    setStatus("saving"); setError("");
    const response = await fetch("/api/evaluations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "appeal", submissionId, rationale: reason }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setError(data.error ?? "Appeal could not be submitted"); setStatus("idle"); return; }
    setStatus("submitted");
  }

  if (status === "submitted") return <p className="appeal-submitted">Appeal submitted for facilitator review.</p>;
  return <div className="score-appeal">{!open ? <button type="button" onClick={() => setOpen(true)}>Appeal this score</button> : <><label>Why should this score be reviewed?<textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="button" onClick={submit} disabled={!reason.trim() || status === "saving"}>{status === "saving" ? "Submitting…" : "Send appeal"}</button>{error && <p role="alert">{error}</p>}</>}</div>;
}
