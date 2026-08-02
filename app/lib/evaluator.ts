import { intakeFields } from "../lab-data";
import { curriculumLabById } from "../curriculum-data";
import type {
  AttemptPayload,
  DeterministicEvalResult,
  DimensionResult,
  RubricBand,
} from "./attempt-types";

const EVALUATOR_VERSION = "lab-01-deterministic-v1";
const KNOWN_SOURCE_IDS = ["NW-REQ-014", "NW-ROADMAP-03", "NW-CAPACITY-06", "NW-POLICY-01", "INTAKE-SCHEMA"];

function dimension(band: RubricBand, evidence: string[], nextStep: string): DimensionResult {
  return { band, evidence, nextStep };
}

function includesAny(value: string, terms: string[]) {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

export function evaluateLabOne(payload: AttemptPayload): DeterministicEvalResult {
  const values = Object.values(payload.draft).map((value) => value.trim());
  const completedFields = values.filter(Boolean).length;
  const allDraftText = values.join(" ");
  const citedSources = KNOWN_SOURCE_IDS.filter((sourceId) => allDraftText.includes(sourceId));
  const unknownCount = values.filter((value) => /^unknown\b/i.test(value)).length;

  let grounding: DimensionResult;
  if (citedSources.length >= 3 && unknownCount >= 2) {
    grounding = dimension("Strong", [`${citedSources.length} source IDs cited`, `${unknownCount} unsupported fields kept Unknown`], "Keep source-level traceability in the final decision artifact.");
  } else if (citedSources.length >= 1 || unknownCount >= 2) {
    grounding = dimension("Capable", [`${citedSources.length} source IDs cited`, `${unknownCount} fields marked Unknown`], "Cite at least three distinct source IDs across material claims.");
  } else {
    grounding = dimension("Developing", ["Material claims have limited visible source traceability"], "Add source IDs and use Unknown instead of filling unsupported values.");
  }

  const completeness = completedFields === intakeFields.length
    ? dimension("Strong", ["All 19 required intake fields are complete"], "Preserve this completeness while keeping unsupported values explicit.")
    : completedFields >= 16
      ? dimension("Capable", [`${completedFields} of 19 fields are complete`], "Complete every required field, using Unknown where evidence is absent.")
      : dimension("Developing", [`${completedFields} of 19 fields are complete`], "Complete the intake schema before requesting a governance decision.");

  const disposition = payload.draft.disposition.toLowerCase();
  const decisionOwner = payload.draft.decisionOwner.toLowerCase();
  const rationale = payload.draft.rationale.toLowerCase();
  const humanOwned = includesAny(decisionOwner, ["steering", "committee"]);
  const supportedDisposition = includesAny(disposition, ["seek clarification", "defer"]);
  const explainsBoundary = includesAny(rationale, ["scope", "capacity", "decision", "unknown", "evidence"]);
  const judgment = supportedDisposition && humanOwned && explainsBoundary
    ? dimension("Strong", ["Disposition is evidence-supported", "Steering Committee remains the decision owner"], "State what new evidence would change the recommendation.")
    : payload.draft.disposition.trim() && payload.draft.decisionOwner.trim()
      ? dimension("Capable", ["A human disposition and decision owner are recorded"], "Tie the recommendation to scope, capacity, and missing evidence.")
      : dimension("Developing", ["Human disposition or governance owner is missing"], "Make the recommendation yourself and name the authorized decision owner.");

  const promptWords = payload.prompt.trim() ? payload.prompt.trim().split(/\s+/).length : 0;
  const boundedPrompt = includesAny(payload.prompt, ["unknown"]) && includesAny(payload.prompt, ["source", "cite", "evidence"]);
  const separatesDecision = includesAny(payload.prompt, ["do not decide", "do not recommend", "human", "facts only"]);
  const efficiency = promptWords >= 25 && boundedPrompt && separatesDecision && payload.selectedSources.length >= 2
    ? dimension("Strong", [`${promptWords}-word reusable prompt`, `${payload.selectedSources.length} permitted sources selected`], "Regression-test this extraction pattern against a second intake.")
    : promptWords >= 15 && payload.selectedSources.length >= 1
      ? dimension("Capable", [`${promptWords}-word prompt recorded`, `${payload.selectedSources.length} permitted sources selected`], "Add explicit Unknown, citation, and human-decision rules to the prompt.")
      : dimension("Developing", ["The extraction process is not yet repeatable"], "Record a schema-based prompt and the exact permitted sources supplied to AI.");

  const confidentialSourceSelected = payload.selectedSources.includes("NW-REQ-014");
  const documentsWithholding = includesAny(payload.verification, ["withheld", "redact", "confidential", "not supplied", "excluded"]);
  const recognizesInjection = includesAny(payload.prompt, ["untrusted", "instructions inside", "source instructions", "treat instructions"]);
  let guardrails: DimensionResult;
  if (confidentialSourceSelected) {
    guardrails = dimension("Developing", ["The confidential request source was marked as supplied to AI"], "Stop and withhold the confidential passage before using an AI tool.");
  } else if (documentsWithholding && recognizesInjection) {
    guardrails = dimension("Strong", ["Confidential source excluded", "Verification documents withholding", "Prompt treats source instructions as untrusted"], "Keep the exact supplied-source record with the submission.");
  } else if (documentsWithholding) {
    guardrails = dimension("Capable", ["Confidential source excluded and withholding documented"], "Add an explicit rule that instructions inside source documents are untrusted.");
  } else {
    guardrails = dimension("Developing", ["The verification note does not document the confidential-data boundary"], "Record what was withheld and why before submission.");
  }

  const dimensions = { grounding, completeness, judgment, efficiency, guardrails };
  const developingCount = Object.values(dimensions).filter((result) => result.band === "Developing").length;
  const passed = guardrails.band !== "Developing" && developingCount <= 1;

  return {
    version: EVALUATOR_VERSION,
    passed,
    completedFields,
    dimensions,
    summary: passed
      ? "The submission clears the deterministic gate and is ready for facilitator review. Judgment dimensions remain provisional until human calibration."
      : "The submission needs revision before facilitator review. Address the Developing dimensions and submit again.",
  };
}

export function evaluateCurriculumLab(labId: string, payload: AttemptPayload): DeterministicEvalResult {
  const lab = curriculumLabById(labId);
  if (!lab) return evaluateLabOne(payload);

  const values = Object.values(payload.draft).map((value) => value.trim());
  const completedFields = values.filter(Boolean).length;
  const allText = `${values.join(" ")} ${payload.verification}`;
  const citedSources = lab.sources.filter((source) => allText.includes(source.id));
  const hasUnknown = /\bunknown\b/i.test(allText);
  const grounding = citedSources.length >= 3
    ? dimension("Strong", [`${citedSources.length} source IDs cited`], "Preserve source-level traceability in the final artifact.")
    : citedSources.length >= 1
      ? dimension("Capable", [`${citedSources.length} source IDs cited`], "Cite at least three distinct sources across material claims.")
      : dimension("Developing", ["Material claims lack visible source IDs"], "Add inline source IDs for claims, conflicts, and exclusions.");
  const completeness = completedFields === lab.fields.length
    ? dimension("Strong", [`All ${lab.fields.length} deliverable sections are complete`], "Keep the artifact concise while preserving exceptions.")
    : completedFields >= Math.max(1, lab.fields.length - 1)
      ? dimension("Capable", [`${completedFields} of ${lab.fields.length} sections are complete`], "Complete the remaining section explicitly.")
      : dimension("Developing", [`${completedFields} of ${lab.fields.length} sections are complete`], "Complete every deliverable section before review.");
  const ownsJudgment = /human|committee|owner|recommend|decision|confidence|tradeoff/i.test(allText);
  const judgment = ownsJudgment
    ? dimension("Capable", ["The artifact records a human judgment boundary"], "Make alternatives and decision ownership explicit.")
    : dimension("Developing", ["Human ownership is not explicit"], "Name the consequential decision and its authorized owner.");
  const promptWords = payload.prompt.trim() ? payload.prompt.trim().split(/\s+/).length : 0;
  const reusable = /source|evidence|cite|unknown|conflict|verify/i.test(payload.prompt);
  const efficiency = promptWords >= 20 && reusable
    ? dimension("Strong", [`${promptWords}-word evidence-bounded prompt recorded`], "Reuse this pattern against the next fixture pack.")
    : promptWords >= 10
      ? dimension("Capable", [`${promptWords}-word prompt recorded`], "Add citation, conflict, Unknown, and verification rules.")
      : dimension("Developing", ["The process is not yet repeatable"], "Record a reusable evidence-bounded prompt.");
  const documentsBoundary = /withheld|excluded|untrusted|verified|not supplied|policy/i.test(payload.verification);
  const guardrails = documentsBoundary && (hasUnknown || /conflict|uncertain|missing/i.test(allText))
    ? dimension("Strong", ["Verification records the data boundary and uncertainty"], "Keep the exact source list with the artifact.")
    : documentsBoundary
      ? dimension("Capable", ["Verification records a guardrail or source boundary"], "Document missing or conflicting evidence explicitly.")
      : dimension("Developing", ["Verification does not explain the guardrail boundary"], "Record supplied sources, exclusions, and unresolved uncertainty.");
  const dimensions = { grounding, completeness, judgment, efficiency, guardrails };
  const developingCount = Object.values(dimensions).filter((result) => result.band === "Developing").length;
  const passed = guardrails.band !== "Developing" && developingCount <= 1;

  return {
    version: `${labId}-deterministic-v1`,
    passed,
    completedFields,
    dimensions,
    summary: passed
      ? "The artifact clears the deterministic gate and is ready for facilitator review."
      : "The artifact needs revision before facilitator review. Address the Developing dimensions and submit again.",
  };
}
