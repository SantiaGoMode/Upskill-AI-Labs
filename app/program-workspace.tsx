"use client";

import { useState } from "react";
import { curriculumLabs } from "./curriculum-data";
import { CurriculumWorkspace } from "./curriculum-workspace";
import { LabWorkspace } from "./lab-workspace";
import type { PersistedAttempt } from "./lib/attempt-types";
import { FacilitatorConsole } from "./facilitator-console";

export function ProgramWorkspace() {
  const [activeLab, setActiveLab] = useState("lab-01");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<PersistedAttempt[]>([]);
  const [learner, setLearner] = useState("");
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [facilitatorOpen, setFacilitatorOpen] = useState(false);
  const selected = curriculumLabs.find((lab) => lab.id === activeLab);

  async function openHistory() {
    const response = await fetch("/api/attempts?history=1");
    if (response.ok) {
      const data = await response.json() as { attempts: PersistedAttempt[]; identity: { displayName: string } };
      setHistory(data.attempts);
      setLearner(data.identity.displayName);
    }
    setHistoryOpen(true);
  }

  function resumeAttempt(attempt: PersistedAttempt) {
    const key = `upskill-ai-labs:${attempt.labId}`;
    let stored: Record<string, unknown> = {};
    try {
      stored = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    } catch {
      stored = {};
    }
    window.localStorage.setItem(key, JSON.stringify({ ...stored, attemptId: attempt.id }));
    setActiveLab(attempt.labId);
    setWorkspaceKey((value) => value + 1);
    setHistoryOpen(false);
  }

  return <><nav className="curriculum-nav" id="curriculum" aria-label="Program curriculum"><div><span className="eyebrow">Curriculum</span><strong>Beacon program manager pathway</strong></div><div className="curriculum-tabs"><button type="button" className={activeLab === "lab-01" ? "active" : ""} onClick={() => setActiveLab("lab-01")}><span>01</span>Intake</button>{curriculumLabs.map((lab) => <button type="button" className={activeLab === lab.id ? "active" : ""} key={lab.id} onClick={() => setActiveLab(lab.id)}><span>{String(lab.number).padStart(2, "0")}</span>{lab.title.replace(/^(Write|Synthesize|Prepare|Red-team|Build and regression-test|Audit|Evaluate and promote) (the )?/, "")}</button>)}</div><button className="history-action" type="button" onClick={() => setFacilitatorOpen(true)}>Facilitator</button><button className="history-action" type="button" onClick={openHistory}>Attempt history</button></nav><FacilitatorConsole open={facilitatorOpen} onClose={() => setFacilitatorOpen(false)} />{historyOpen && <div className="history-backdrop" role="presentation"><section className="history-panel" role="dialog" aria-modal="true" aria-labelledby="history-title"><header><div><span className="eyebrow">Learner record</span><h2 id="history-title">{learner || "Attempt history"}</h2></div><button type="button" onClick={() => setHistoryOpen(false)} aria-label="Close history">×</button></header><div>{history.length ? history.map((attempt) => <button type="button" className="history-item" key={attempt.id} onClick={() => resumeAttempt(attempt)}><span><strong>{attempt.labId.replace("lab-", "Lab ")}</strong><small>{new Date(attempt.updatedAt).toLocaleString()}</small></span><b className={attempt.status}>{attempt.status.replace("_", " ")}</b></button>) : <p className="empty-history">No durable attempts yet. Begin a lab to create the first record.</p>}</div></section></div>}{selected ? <CurriculumWorkspace key={`${selected.id}-${workspaceKey}`} lab={selected} /> : <LabWorkspace key={`lab-01-${workspaceKey}`} />}</>;
}
