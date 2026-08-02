export type ModelProvider = "gemini" | "openai" | "anthropic" | "ollama";

export type ModelUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export type ModelCost = {
  currency: "USD";
  estimatedUsd: number | null;
  inputRatePerMillion: number | null;
  cachedInputRatePerMillion: number | null;
  cacheWriteRatePerMillion: number | null;
  outputRatePerMillion: number | null;
  pricingBasis: string;
};

export type ModelRunTrace = {
  responseId: string;
  provider: ModelProvider;
  endpoint: "responses" | "generateContent" | "messages" | "chat";
  status: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  sourceIds: string[];
};

export type PersistedModelRun = {
  id: string;
  attemptId: string;
  provider: ModelProvider;
  model: string;
  outputText: string;
  trace: ModelRunTrace;
  usage: ModelUsage;
  cost: ModelCost;
  createdAt: string;
};

export type ProviderStatus = {
  provider: ModelProvider;
  label: string;
  model: string;
  configured: boolean;
  note: string;
};
