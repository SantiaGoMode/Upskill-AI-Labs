"use client";

import { useEffect, useMemo, useState } from "react";
import { artifactShapeFromText, type ArtifactShape, type WorkflowCandidate } from "./lib/redaction";
import type { RecipeNode } from "./lib/recipe-engine";
import { CohortConsole } from "./cohort-console";

type Tab = "personalize" | "path" | "studio" | "cohorts" | "governance" | "ledger";
type WorkflowMap = { id: string; intakeTier: string; workflows: WorkflowCandidate[]; priorityWorkflowIds: string[]; status: string };
type Curriculum = { route: RecipeNode[]; estimatedMinutes: number };
type Policy = { name: string; version: number; allowedIntakeTier: string; dataClasses: string[]; approvedModels: string[]; prohibitedUses: string[]; disclosureRules: string[]; humanReviewRules: string[]; promptRetentionDays: number };
type Version = { id: string; name: string; version: number; status: string; changeSummary: string; content: Record<string, unknown> };
type Claim = { id: string; label: string; band: string; effectiveStatus: string; expiresAt: string; evidence: unknown[] };
type Baseline = { id: string; workflowName: string; metricName: string; baselineValue: string; targetValue: string; unit: string; measuredAt: string };
type CurrentExperiment = { id: string; tier: string; transferScore: number | null };

const providers = ["gemini", "openai", "anthropic", "ollama"];
const dataClassOptions = ["Public", "Internal", "Confidential", "Regulated"];

export function PhaseTwoConsole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("personalize");
  const [workflowMap, setWorkflowMap] = useState<WorkflowMap | null>(null);
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [currentExperiment, setCurrentExperiment] = useState<CurrentExperiment | null>(null);
  const [experiment, setExperiment] = useState<{ T0: { count: number; average: number | null }; T1: { count: number; average: number | null }; delta: number | null; decision: string } | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("Program manager coordinating cross-functional delivery, governance, risks, and executive reporting.");
  const [industry, setIndustry] = useState("Technology"); const [seniority, setSeniority] = useState("Senior program manager");
  const [tier, setTier] = useState("T1"); const [artifactName, setArtifactName] = useState("weekly-status.md"); const [artifactText, setArtifactText] = useState("");
  const [versions, setVersions] = useState<Version[]>([]); const [summary, setSummary] = useState<{ confirmedLearners: number; priorities: Array<{ name: string; count: number }> } | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]); const [baselines, setBaselines] = useState<Baseline[]>([]);
  const shape = useMemo(() => artifactText ? artifactShapeFromText(artifactName, artifactText) : null, [artifactName, artifactText]);

  async function json(url: string, init?: RequestInit) {
    const response = await fetch(url, init); const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed"); return data;
  }
  async function load() {
    setError("");
    try {
      const onboarding = await json("/api/onboarding");
      setWorkflowMap(onboarding.workflowMap); setCurriculum(onboarding.curriculum); setPolicy(onboarding.policy); setExperiment(onboarding.experiment); setCurrentExperiment(onboarding.currentExperiment);
      const [studio, ledger, governance] = await Promise.allSettled([json("/api/trainer-studio"), json("/api/capabilities"), json("/api/governance")]);
      if (studio.status === "fulfilled") { setVersions(studio.value.versions); setSummary(studio.value.workflowSummary); }
      if (ledger.status === "fulfilled") { setClaims(ledger.value.claims); setBaselines(ledger.value.baselines); }
      if (governance.status === "fulfilled") setPolicy(governance.value.policy);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load Phase 2"); }
  }
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // Opening the modal is the synchronization boundary; load intentionally reads current server state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  async function act(url: string, body: object, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { const data = await json(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); setNotice(success); await load(); return data; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed"); return null; }
    finally { setBusy(false); }
  }
  async function propose() {
    const artifactShapes: ArtifactShape[] = tier === "T1" && shape ? [shape] : [];
    const data = await act("/api/onboarding", { action: "propose", roleDescription: role, industry, seniority, intakeTier: tier, artifactShapes }, "Workflow map proposed. Review and choose three priorities.");
    if (data) setWorkflowMap(data.workflowMap);
  }
  function togglePriority(id: string) {
    if (!workflowMap) return;
    const current = workflowMap.priorityWorkflowIds;
    const next = current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current;
    setWorkflowMap({ ...workflowMap, priorityWorkflowIds: next });
  }
  async function confirm() {
    if (!workflowMap) return;
    await act("/api/onboarding", { action: "confirm", mapId: workflowMap.id, workflows: workflowMap.workflows, priorityWorkflowIds: workflowMap.priorityWorkflowIds }, "Personal pathway created.");
    setTab("path");
  }
  if (!open) return null;

  return <div className="phase2-backdrop"><section className="phase2-console" role="dialog" aria-modal="true" aria-labelledby="phase2-title">
    <header><div><span className="eyebrow accent">Phase 2</span><h2 id="phase2-title">From practice to workplace transfer</h2></div><button type="button" onClick={onClose} aria-label="Close Phase 2">×</button></header>
    <nav aria-label="Phase 2 areas">{(["personalize", "path", "studio", "cohorts", "governance", "ledger"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "personalize" ? "Bring your own job" : item === "path" ? "My pathway" : item === "studio" ? "Trainer Studio" : item === "cohorts" ? "Cohorts" : item === "governance" ? "Governance" : "Capability Ledger"}</button>)}</nav>
    {error && <p className="phase2-message error" role="alert">{error}</p>}{notice && <p className="phase2-message">{notice}</p>}
    <main>
      {tab === "personalize" && <section className="phase2-grid"><div className="phase2-card"><span className="eyebrow">Workflow intake</span><h3>Map the work before adapting the course</h3><label>Role description<textarea value={role} onChange={(event) => setRole(event.target.value)} rows={4} /></label><div className="split-fields"><label>Industry<input value={industry} onChange={(event) => setIndustry(event.target.value)} /></label><label>Seniority<input value={seniority} onChange={(event) => setSeniority(event.target.value)} /></label></div><label>Intake tier<select value={tier} onChange={(event) => setTier(event.target.value)}><option value="T0">T0 · description only</option><option value="T1">T1 · client-side redacted shape</option><option value="T2">T2 · full artifact (policy gated)</option></select></label>{tier === "T1" && <><div className="privacy-note"><strong>Raw text stays in this browser.</strong><span>The server receives counts and structural markers only—never the artifact’s words.</span></div><label>Artifact name<input value={artifactName} onChange={(event) => setArtifactName(event.target.value)} /></label><label>Paste a representative artifact<textarea value={artifactText} onChange={(event) => setArtifactText(event.target.value)} rows={6} placeholder="Paste locally to generate a non-content structural profile…" /></label>{shape && <div className="shape-preview"><b>Safe shape preview</b><span>{shape.lengthBucket} · {shape.lines} lines · {shape.paragraphs} paragraphs · {shape.tableRows} table rows</span><span>{shape.markers.dates} date · {shape.markers.emails} email · {shape.markers.currency} currency markers</span></div>}</>}<button className="phase2-primary" disabled={busy || tier === "T1" && !shape} onClick={propose}>Propose nine workflows</button></div>
        <div className="phase2-card"><span className="eyebrow">Review and correct</span><h3>{workflowMap ? "Choose the three workflows that matter most" : "Your workflow map will appear here"}</h3>{experiment && <p className="experiment-note">T1 transfer experiment: {experiment.T1.count} measured · {experiment.delta === null ? "collecting a T0/T1 baseline" : `${experiment.delta > 0 ? "+" : ""}${experiment.delta.toFixed(1)} points vs T0`} · {experiment.decision}</p>}{workflowMap?.workflows.map((workflow, index) => <article className={`workflow-choice ${workflowMap.priorityWorkflowIds.includes(workflow.id) ? "selected" : ""}`} key={workflow.id}><button type="button" onClick={() => togglePriority(workflow.id)} aria-pressed={workflowMap.priorityWorkflowIds.includes(workflow.id)}><span>{index + 1}</span><div><strong>{workflow.name}</strong><small>{workflow.trigger} → {workflow.outcome}</small></div></button></article>)}{workflowMap && <button className="phase2-primary" disabled={busy || workflowMap.priorityWorkflowIds.length !== 3} onClick={confirm}>Confirm three priorities and build pathway</button>}{currentExperiment && <TransferMeasurement busy={busy} experiment={currentExperiment} act={act} />}</div></section>}
      {tab === "path" && <section className="phase2-card wide"><span className="eyebrow">Recipe engine · fixed spine, flexible skin</span><h3>{curriculum ? `${curriculum.estimatedMinutes} minute personalized pathway` : "Complete workflow intake to create your path"}</h3><p className="section-copy">Every learner completes the same assessed eight-lab spine. Scenario skins, pacing, and remediation are visible—not hidden.</p><div className="route-list">{curriculum?.route.map((node) => <article key={node.labId}><span>{String(node.order).padStart(2, "0")}</span><div><strong>{node.title}</strong><small>{node.reason}</small></div><b className={node.mode}>{node.mode} · {node.minutes}m</b></article>)}</div></section>}
      {tab === "studio" && <StudioPanel busy={busy} versions={versions} summary={summary} act={act} />}
      {tab === "cohorts" && <CohortConsole />}
      {tab === "governance" && policy && <GovernancePanel busy={busy} policy={policy} act={act} />}
      {tab === "ledger" && <LedgerPanel busy={busy} claims={claims} baselines={baselines} workflowMap={workflowMap} act={act} />}
    </main>
  </section></div>;
}

function TransferMeasurement({ busy, experiment, act }: { busy: boolean; experiment: CurrentExperiment; act: (url: string, body: object, success: string) => Promise<unknown> }) {
  const [score, setScore] = useState(experiment.transferScore?.toString() ?? ""); const [notes, setNotes] = useState("");
  return <div className="transfer-measure"><strong>Measure transfer quality for {experiment.tier}</strong><small>Score how accurately the workflow map reflects the learner’s actual work. Compare aggregate T1 against T0.</small><div className="split-fields"><label>Score (0–100)<input type="number" min="0" max="100" value={score} onChange={(event) => setScore(event.target.value)} /></label><label>Observation<input value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div><button className="phase2-secondary" disabled={busy || !score} onClick={() => act("/api/onboarding", { action: "measure-transfer", experimentId: experiment.id, score: Number(score), notes }, "Transfer measurement recorded.")}>Record transfer score</button></div>;
}

function StudioPanel({ busy, versions, summary, act }: { busy: boolean; versions: Version[]; summary: { confirmedLearners: number; priorities: Array<{ name: string; count: number }> } | null; act: (url: string, body: object, success: string) => Promise<unknown> }) {
  const [name, setName] = useState("Program manager pathway · cohort edition"); const [change, setChange] = useState("Adapt scenario skin to the cohort’s top workflow priorities while preserving assessed outcomes.");
  const [cohortName, setCohortName] = useState("Program managers · pilot cohort"); const [learners, setLearners] = useState("");
  const latest = versions[0];
  return <section className="phase2-grid"><div className="phase2-card"><span className="eyebrow">Cohort composer</span><h3>Aggregate needs without exposing learner artifacts</h3><div className="studio-summary"><strong>{summary?.confirmedLearners ?? 0}</strong><span>confirmed workflow maps</span></div>{summary?.priorities.slice(0, 5).map((item) => <p className="priority-row" key={item.name}><span>{item.name}</span><b>{item.count}</b></p>)}<label>Version name<input value={name} onChange={(event) => setName(event.target.value)} /></label><button className="phase2-primary" disabled={busy} onClick={() => act("/api/trainer-studio", { action: "fork", parentId: latest?.id, name }, "Draft curriculum fork created.")}>Fork assessed curriculum</button>{latest?.status === "published" && <div className="cohort-form"><label>Cohort name<input value={cohortName} onChange={(event) => setCohortName(event.target.value)} /></label><label>Learner emails<textarea rows={3} value={learners} onChange={(event) => setLearners(event.target.value)} placeholder="one@example.com, two@example.com" /></label><button className="phase2-secondary" disabled={busy || !cohortName} onClick={() => act("/api/trainer-studio", { action: "create-cohort", name: cohortName, curriculumVersionId: latest.id, learnerEmails: learners.split(/[\s,]+/).filter(Boolean) }, "Cohort composed from the published curriculum.")}>Create cohort</button></div>}</div><div className="phase2-card"><span className="eyebrow">Human review gate</span><h3>Version, review, approve, publish</h3>{latest ? <><div className="version-head"><div><strong>{latest.name} · v{latest.version}</strong><small>{latest.status.replace("_", " ")}</small></div></div>{latest.status === "draft" && <><label>Change summary<textarea rows={4} value={change} onChange={(event) => setChange(event.target.value)} /></label><button className="phase2-secondary" disabled={busy} onClick={async () => { await act("/api/trainer-studio", { action: "edit", id: latest.id, content: latest.content, changeSummary: change }, "Draft saved."); }}>Save draft</button><button className="phase2-primary" disabled={busy || !latest.changeSummary && !change} onClick={() => act("/api/trainer-studio", { action: "submit-review", id: latest.id }, "Sent to human review.")}>Submit for review</button></>}{latest.status === "in_review" && <button className="phase2-primary" disabled={busy} onClick={() => act("/api/trainer-studio", { action: "approve", id: latest.id }, "Curriculum approved by facilitator.")}>Approve assessed spine</button>}{latest.status === "approved" && <button className="phase2-primary" disabled={busy} onClick={() => act("/api/trainer-studio", { action: "publish", id: latest.id }, "Reviewed curriculum published.")}>Publish version</button>}{latest.status === "published" && <p className="privacy-note"><strong>Published and review-gated.</strong><span>Ready for cohort assignment.</span></p>}</> : <p className="section-copy">Fork the canonical curriculum to begin. Scratch edits never count toward capability claims.</p>}<div className="version-list">{versions.map((item) => <span key={item.id}>v{item.version} · {item.status}</span>)}</div></div></section>;
}

function GovernancePanel({ busy, policy, act }: { busy: boolean; policy: Policy; act: (url: string, body: object, success: string) => Promise<unknown> }) {
  const [name, setName] = useState(policy.name); const [tier, setTier] = useState(policy.allowedIntakeTier); const [classes, setClasses] = useState(policy.dataClasses); const [models, setModels] = useState(policy.approvedModels); const [retention, setRetention] = useState(policy.promptRetentionDays);
  const toggle = (item: string, values: string[], set: (values: string[]) => void) => set(values.includes(item) ? values.filter((value) => value !== item) : [...values, item]);
  const payload = { name, allowedIntakeTier: tier, dataClasses: classes, approvedModels: models, promptRetentionDays: retention, prohibitedUses: policy.prohibitedUses, disclosureRules: policy.disclosureRules, humanReviewRules: policy.humanReviewRules };
  return <section className="phase2-grid"><div className="phase2-card"><span className="eyebrow">Active policy · v{policy.version}</span><h3>Model and data-class controls</h3><label>Policy name<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Maximum BYOJ tier<select value={tier} onChange={(event) => setTier(event.target.value)}><option>T0</option><option>T1</option><option>T2</option></select></label><fieldset><legend>Allowed data classes</legend>{dataClassOptions.map((item) => <label className="inline-check" key={item}><input type="checkbox" checked={classes.includes(item)} onChange={() => toggle(item, classes, setClasses)} />{item}</label>)}</fieldset><fieldset><legend>Approved providers</legend>{providers.map((item) => <label className="inline-check" key={item}><input type="checkbox" checked={models.includes(item)} onChange={() => toggle(item, models, setModels)} />{item}</label>)}</fieldset><label>Prompt retention days<input type="number" min="0" max="365" value={retention} onChange={(event) => setRetention(Number(event.target.value))} /></label><div className="action-row"><button className="phase2-secondary" disabled={busy} onClick={() => act("/api/governance", { action: "save", ...payload }, "Policy draft saved.")}>Save draft</button><button className="phase2-primary" disabled={busy || !classes.length || !models.length} onClick={() => act("/api/governance", { action: "activate", ...payload }, "Versioned policy activated.")}>Activate policy</button></div></div><div className="phase2-card"><span className="eyebrow">Control plane</span><h3>Boundaries learners can see</h3><h4>Prohibited uses</h4>{policy.prohibitedUses.map((item) => <p className="rule" key={item}>{item}</p>)}<h4>Disclosure</h4>{policy.disclosureRules.map((item) => <p className="rule" key={item}>{item}</p>)}<h4>Human review</h4>{policy.humanReviewRules.map((item) => <p className="rule" key={item}>{item}</p>)}<p className="privacy-note"><strong>SOC 2 evidence collection started.</strong><span>Policy changes, curriculum gates, cohort creation, baselines, and measurements generate actor-linked audit events.</span></p></div></section>;
}

function LedgerPanel({ busy, claims, baselines, workflowMap, act }: { busy: boolean; claims: Claim[]; baselines: Baseline[]; workflowMap: WorkflowMap | null; act: (url: string, body: object, success: string) => Promise<unknown> }) {
  const priority = workflowMap?.workflows.find((item) => workflowMap.priorityWorkflowIds.includes(item.id));
  const [metric, setMetric] = useState("Minutes per completed workflow"); const [unit, setUnit] = useState("minutes"); const [baseline, setBaseline] = useState(""); const [target, setTarget] = useState(""); const [measurement, setMeasurement] = useState(""); const [reflection, setReflection] = useState("");
  return <section className="phase2-grid"><div className="phase2-card"><span className="eyebrow">Evidence-linked · banded · decaying</span><h3>Capability claims</h3><button className="phase2-primary" disabled={busy} onClick={() => act("/api/capabilities", { action: "refresh-claims" }, "Claims refreshed from assessed submissions.")}>Refresh from lab evidence</button><div className="claims-list">{claims.length ? claims.map((claim) => <article key={claim.id}><div><strong>{claim.label}</strong><small>{claim.evidence.length} evidence link(s) · expires {new Date(claim.expiresAt).toLocaleDateString()}</small></div><b className={claim.band.toLowerCase()}>{claim.band} · {claim.effectiveStatus}</b></article>) : <p className="section-copy">Submit assessed labs, then refresh to create evidence-linked claims.</p>}</div></div><div className="phase2-card"><span className="eyebrow">Workflow impact · self-attested tier</span><h3>Baseline now, remeasure at day 30</h3><label>Workflow<input value={priority?.name ?? "Select priorities in BYOJ first"} readOnly /></label><label>Metric<input value={metric} onChange={(event) => setMetric(event.target.value)} /></label><div className="split-fields"><label>Baseline<input value={baseline} onChange={(event) => setBaseline(event.target.value)} /></label><label>Target<input value={target} onChange={(event) => setTarget(event.target.value)} /></label></div><label>Unit<input value={unit} onChange={(event) => setUnit(event.target.value)} /></label><button className="phase2-secondary" disabled={busy || !priority || !baseline || !target} onClick={() => act("/api/capabilities", { action: "baseline", workflowId: priority?.id, workflowName: priority?.name, metricName: metric, unit, baselineValue: baseline, targetValue: target }, "Workflow baseline recorded.")}>Record baseline</button>{baselines[0] && <div className="remeasure"><strong>{baselines[0].workflowName}</strong><small>Baseline {baselines[0].baselineValue} {baselines[0].unit}; target {baselines[0].targetValue}</small><label>Current value<input value={measurement} onChange={(event) => setMeasurement(event.target.value)} /></label><label>Reflection<textarea rows={3} value={reflection} onChange={(event) => setReflection(event.target.value)} /></label><button className="phase2-primary" disabled={busy || !measurement || reflection.length < 10} onClick={() => act("/api/capabilities", { action: "measurement", baselineId: baselines[0].id, value: measurement, reflection }, "Self-attested measurement recorded; day-30 eligibility is calculated by the server.")}>Record measurement</button></div>}</div></section>;
}
