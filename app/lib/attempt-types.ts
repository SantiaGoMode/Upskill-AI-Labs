import type { IntakeDraft } from "../lab-data";

export type AttemptPayload = {
  draft: IntakeDraft;
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
