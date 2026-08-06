/**
 * Deliverable fields keyed by the lab's own field ids. Lab 1 uses `IntakeDraft`
 * from `lab-data`; labs 2 to 8 each define a different field set, and drafts are
 * rehydrated from stored JSON, so the shared payload type stays open.
 */
export type AttemptDraft = Record<string, string>;

export type AttemptPayload = {
  draft: AttemptDraft;
  prompt: string;
  selectedSources: string[];
  verification: string;
  secondsRemaining: number;
};

export type PersistedAttempt = AttemptPayload & {
  id: string;
  ownerEmail: string;
  labId: string;
  status: "in_progress" | "submitted";
  createdAt: string;
  updatedAt: string;
};

export type RubricBand = "Developing" | "Capable" | "Strong";

export type DimensionResult = {
  band: RubricBand;
  evidence: string[];
  nextStep: string;
};

export type DeterministicEvalResult = {
  version: string;
  passed: boolean;
  completedFields: number;
  dimensions: Record<
    "grounding" | "completeness" | "judgment" | "efficiency" | "guardrails",
    DimensionResult
  >;
  summary: string;
};
