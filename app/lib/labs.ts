import { intakeFields, labSources, type LabSource } from "../lab-data";
import { curriculumLabs } from "../curriculum-data";

/**
 * One catalog for all eight labs.
 *
 * Lab 1 previously had its own bespoke workspace component; labs 2-8 shared a
 * second one. Both are described here instead so a single lab runner can serve
 * every lab. The field keys are unchanged, which matters: the evaluator keys
 * lab-01 off `intakeFields` and grades the other labs against their own field
 * lists, and `/api/attempts` picks the evaluator by `labId`.
 */

export type LabFieldKind = "text" | "textarea" | "select";

export type LabField = {
  key: string;
  label: string;
  kind: LabFieldKind;
  options?: string[];
  placeholder?: string;
  /** Surfaced in the always-visible draft rail rather than only the full form. */
  primary?: boolean;
};

export type Lab = {
  id: string;
  number: number;
  title: string;
  play: string;
  /** One-line framing shown in lists and cards. */
  summary: string;
  brief: string;
  deliverable: string;
  scenario: string;
  fields: LabField[];
  sources: LabSource[];
  /** Guidance shown above the prompt editor. */
  workbenchNote: string;
  /** How to approach the lab, shown on the brief stage. */
  steps: string[];
  /** The traps to stay alert to. Names the risk without giving the answer away. */
  watchFor: string[];
  /** Values the lab starts with, given to the learner rather than asked for. */
  prefill?: Record<string, string>;
};

/**
 * Attempts are persisted with `secondsRemaining` clamped to 1500 server-side,
 * so every lab is timeboxed to 25 minutes. Raising this needs an API change.
 */
export const LAB_TIMEBOX_SECONDS = 25 * 60;

const LAB_ONE_TEXTAREAS = new Set(["businessProblem", "rationale", "dependencies"]);
const LAB_ONE_PRIMARY = new Set(["requestTitle", "requestedDate", "alignment", "disposition", "rationale"]);

const LAB_ONE_SELECTS: Record<string, string[]> = {
  alignment: ["Out of current pilot scope", "In scope", "Unknown"],
  disposition: ["Seek clarification", "Defer", "Accept"],
};

const LAB_ONE_PLACEHOLDERS: Record<string, string> = {
  requestedDate: "Unknown until supported",
  rationale: "State your reasoning and cite source IDs…",
};

const labOneFields: LabField[] = intakeFields.map(([key, label]) => ({
  key,
  label,
  kind: LAB_ONE_SELECTS[key] ? "select" : LAB_ONE_TEXTAREAS.has(key) ? "textarea" : "text",
  options: LAB_ONE_SELECTS[key],
  placeholder: LAB_ONE_PLACEHOLDERS[key] ?? (LAB_ONE_TEXTAREAS.has(key) ? "Use Unknown when evidence is absent" : "Unknown when unsupported"),
  primary: LAB_ONE_PRIMARY.has(key),
}));

const labOne: Lab = {
  id: "lab-01",
  number: 1,
  title: "Triage the Beacon intake",
  play: "EXTRACT-STRUCTURE",
  summary: "Turn an urgent, partly confidential request into a validated intake record.",
  brief:
    "Turn an urgent feature request into a validated intake record. Separate evidence from assumption, respect the data boundary, and make a human-owned recommendation.",
  deliverable:
    "A 19-field intake record with source IDs on material claims, Unknown where evidence is absent, and a named human decision owner.",
  scenario: "Project Beacon · August 3, 2026",
  workbenchNote:
    "Select only sources allowed by policy. The confidential request email is deliberately unavailable to the AI surface — redact it outside the workbench first.",
  steps: [
    "Read all five sources before writing anything. One of them contradicts the request.",
    "Build a prompt that names the fields, mandates Unknown, and requires source IDs.",
    "Run it, then check every populated field against the source it cites.",
    "Complete the record yourself. Unknowns are findings, not gaps to fill in.",
    "Write the verification note: what you supplied, what you withheld, what you checked.",
  ],
  watchFor: [
    "One source is confidential and must never reach the AI workbench",
    "One source contains an instruction aimed at you or the model",
    "Several fields have no supporting evidence anywhere in the pack",
    "The requester's assumption about scope conflicts with the approved roadmap",
  ],
  fields: labOneFields,
  sources: labSources,
  prefill: {
    requestId: "NW-REQ-014",
    requestTitle: "Customer health dashboard request",
  },
};

const CURRICULUM_SUMMARIES: Record<string, string> = {
  "lab-02": "Reconcile conflicting delivery evidence into a steering-ready status.",
  "lab-03": "Cut noisy risk signals down to the five worth actively managing.",
  "lab-04": "Frame a scope decision without making it on the committee's behalf.",
  "lab-05": "Find the weaknesses in a confident recovery plan before it ships.",
  "lab-06": "Turn a repeated status process into a tool someone else can run.",
  "lab-07": "Test an executive narrative against the record behind it.",
  "lab-08": "Decide from regression evidence whether a workflow is fit to promote.",
};

const CURRICULUM_WORKBENCH_NOTE =
  "Supply only the sources you have actually reviewed. Record the citation, conflict, Unknown, and human-judgment rules in the prompt itself — that is what makes it reusable.";


const CURRICULUM_STEPS: Record<string, string[]> = {
  "lab-02": [
    "Check the date on every source. One sits outside the reporting window.",
    "Find where two sources report different numbers for the same thing.",
    "Draft with a prompt that forbids averaging and requires inline source IDs.",
    "Set the RAG status yourself — the prompt must not do it for you.",
    "Flag any commitment that has no named owner.",
  ],
  "lab-03": [
    "Separate authoritative records from informal signals before scoring anything.",
    "Apply the supplied risk guide, not your own severity scale.",
    "When you merge duplicates, keep every original ID and every owner.",
    "Write the excluded appendix — it is the part people ask about.",
  ],
  "lab-04": [
    "State the decision as a question the committee can answer.",
    "Build three options a reasonable person could actually choose.",
    "Score every option against the same criteria; use Unknown for missing cells.",
    "Name the decision owner from the governance sources, not by preference.",
  ],
  "lab-05": [
    "Read the plan once, then read the dependency map before forming a view.",
    "Rank challenges by consequence, not by how easy they are to fix.",
    "Separate what evidence contradicts from what only a human can answer.",
    "Revise the plan only after the challenge log is complete.",
  ],
  "lab-06": [
    "Write the purpose and the non-goals before the prompt.",
    "Define the input contract: what must be present for a run to be valid.",
    "List the checks an operator must do by hand.",
    "Run the two week packs and record what broke.",
  ],
  "lab-07": [
    "Break the narrative into individual material claims first.",
    "Give each claim one of three verdicts: supported, contradicted, unsupported.",
    "Do not treat unsupported as false — they are different findings.",
    "Escalate only what changes scope, funding, date or control posture.",
  ],
  "lab-08": [
    "Read the regression report by category, not just the headline score.",
    "Identify which failures are critical and therefore block promotion outright.",
    "Cluster the failures — repeated failures usually share one cause.",
    "Make the promote / revise / retire call and name a rollback trigger.",
  ],
};

const CURRICULUM_WATCH: Record<string, string[]> = {
  "lab-02": [
    "One update is dated outside the reporting window",
    "Two sources disagree on the same metric",
    "At least one commitment has no owner",
    "The overall status is yours to set, not the model's",
  ],
  "lab-03": [
    "An opinion in a chat export carries no corroboration",
    "An instruction is embedded inside one of the source documents",
    "Merging duplicates can silently drop an owner",
  ],
  "lab-04": [
    "Cost ranges carry different confidence levels",
    "Some criteria have no evidence for some options",
    "Decision ownership is defined in the governance sources",
  ],
  "lab-05": [
    "A single person is assigned to two parallel workstreams",
    "The plan claims full recovery while a gate remains unmet",
    "Weekend coverage is assumed but not approved",
  ],
  "lab-06": [
    "Week 11's pack is deliberately harder than week 10's",
    "A source type appears that the jig has never seen",
    "Two sources disagree on a pass rate",
  ],
  "lab-07": [
    "Confident prose can hide an unmet control gate",
    "'No source addresses this' is not the same as 'this is false'",
    "The forecast exceeds the approved budget",
  ],
  "lab-08": [
    "A high pass count can still contain a critical failure",
    "One rubric dimension sits below the agreement threshold",
    "Promotion needs an owner and a rollback trigger, not just a score",
  ],
};


/** Field-specific prompts beat one repeated placeholder on every textarea. */
const CURRICULUM_PLACEHOLDERS: Record<string, string> = {
  "lab-02.ragStatus": "Amber / Red / Green — your call, not the model's",
  "lab-02.statusRationale": "Why this status, with a source ID against each supporting fact",
  "lab-02.achievements": "What actually completed in the window, with dates and source IDs",
  "lab-02.risks": "Each risk, its evidence, and any CONFLICT between sources",
  "lab-02.decisions": "What the committee must decide, by when, and who owns it",
  "lab-02.commitments": "Next-period commitments with named owners. Flag any that have none.",
  "lab-03.topRisks": "Five risks, each with evidence, owner, response, trigger and confidence",
  "lab-03.deduplication": "Which entries you merged, and every ID and owner you retained",
  "lab-03.ownersResponses": "Owner and planned response per risk, taken from the sources",
  "lab-03.triggersConfidence": "What would tell you the risk is materialising, and how sure you are",
  "lab-03.excludedSignals": "What you left out and the rule that excluded it",
  "lab-04.decisionStatement": "The decision as a question the committee can answer",
  "lab-04.options": "Three options a reasonable person could actually choose",
  "lab-04.criteria": "The criteria every option is scored against",
  "lab-04.tradeoffs": "Option against criterion. Use Unknown for cells with no evidence.",
  "lab-04.recommendation": "Your recommendation and the specific evidence behind it",
  "lab-04.assumptions": "What you assumed, and whether the decision is reversible",
  "lab-04.decisionOwner": "Taken from the governance sources, not chosen",
  "lab-05.challengeLog": "Ranked by consequence if the challenge holds, not by ease of fixing",
  "lab-05.evidence": "The source that contradicts each challenged claim",
  "lab-05.humanQuestions": "What the evidence cannot settle and a person must decide",
  "lab-05.revisedPlan": "The plan section rewritten to survive the challenges",
  "lab-05.confidence": "How confident you now are, and why",
  "lab-06.versionedPrompt": "The prompt itself, with a version number",
  "lab-06.operatorInstructions": "What a colleague does, step by step, without you present",
  "lab-06.inputContract": "Exactly which sources must be present for a valid run",
  "lab-06.verificationChecklist": "The three to five things the operator checks by hand",
  "lab-06.failureRules": "What happens when a source is missing or two sources conflict",
  "lab-06.regressionResults": "What broke in week 10 and week 11",
  "lab-06.humanBoundary": "The decisions this jig must never make",
  "lab-07.claimLedger": "One row per material claim: claim, source, verdict",
  "lab-07.contradictions": "Only the contradictions, with the source that establishes each",
  "lab-07.correctedNarrative": "The narrative rewritten to match the record",
  "lab-07.unresolvedQuestions": "Claims no source addresses. Unsupported is not the same as false.",
  "lab-07.escalation": "What changes scope, funding, date or control — and who owns it",
  "lab-07.confidence": "Your confidence per material claim",
  "lab-08.regressionReport": "Results by category, not just the headline score",
  "lab-08.failureTaxonomy": "Failure types, counts, and which are critical",
  "lab-08.promptRevision": "The specific lines you changed and why",
  "lab-08.promotionDecision": "Promote, revise or retire — and the gate that decided it",
  "lab-08.monitoringPlan": "How you will notice it breaking, and the rollback trigger",
  "lab-08.humanBoundary": "The decisions this workflow must never make, and its owner",
  "lab-08.evidencePack": "Source IDs for the evidence behind the decision",
};

const curriculumCatalog: Lab[] = curriculumLabs.map((lab) => ({
  id: lab.id,
  number: lab.number,
  title: lab.title,
  play: lab.play,
  summary: CURRICULUM_SUMMARIES[lab.id] ?? lab.brief,
  brief: lab.brief,
  deliverable: lab.deliverable,
  scenario: "Project Beacon · Northwind",
  workbenchNote: CURRICULUM_WORKBENCH_NOTE,
  steps: CURRICULUM_STEPS[lab.id] ?? [],
  watchFor: CURRICULUM_WATCH[lab.id] ?? [],
  fields: lab.fields.map((field) => ({
    key: field.key,
    label: field.label,
    kind: field.multiline ? "textarea" : "text",
    placeholder:
      CURRICULUM_PLACEHOLDERS[`${lab.id}.${field.key}`] ??
      (field.multiline ? "Cite source IDs. Use Unknown where evidence is absent." : "Unknown where unsupported"),
    primary: true,
  })),
  sources: lab.sources,
}));

export const labs: Lab[] = [labOne, ...curriculumCatalog];

export const labById = (labId: string) => labs.find((lab) => lab.id === labId);

const SHORT_TITLES: Record<string, string> = {
  "lab-01": "Beacon intake",
  "lab-02": "Weekly status",
  "lab-03": "Risk picture",
  "lab-04": "Scope decision",
  "lab-05": "Recovery red-team",
  "lab-06": "Status jig",
  "lab-07": "Narrative audit",
  "lab-08": "Promotion call",
};

/** Short label for tabs and rails, e.g. "Weekly status". */
export const labShortTitle = (lab: Lab) => SHORT_TITLES[lab.id] ?? lab.title;

export const isSourceAllowedForAi = (source: LabSource) => source.classification === "Internal";

export function emptyDraftFor(lab: Lab): Record<string, string> {
  return { ...Object.fromEntries(lab.fields.map((field) => [field.key, ""])), ...lab.prefill };
}

export function completedFieldCount(lab: Lab, draft: Record<string, string>) {
  return lab.fields.filter((field) => draft[field.key]?.trim()).length;
}
