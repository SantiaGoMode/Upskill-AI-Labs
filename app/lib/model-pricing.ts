import type { ModelCost, ModelProvider, ModelUsage } from "./model-run-types";

const STANDARD_SHORT_CONTEXT_RATES: Record<string, [number, number, number, number]> = {
  "gpt-5.6-sol": [5, 0.5, 6.25, 30],
  "gpt-5.6": [5, 0.5, 6.25, 30],
  "gpt-5.6-terra": [2, 0.2, 2.5, 12],
  "gpt-5.6-luna": [0.2, 0.02, 0.25, 1.2],
};

const PROVIDER_RATES: Partial<Record<ModelProvider, Record<string, [number, number]>>> = {
  gemini: {
    "gemini-3.5-flash-lite": [0.3, 2.5],
    "gemini-3.1-flash-lite": [0.25, 1.5],
  },
  anthropic: {
    "claude-haiku-4-5-20251001": [0.5, 2.5],
    "claude-haiku-4-5": [0.5, 2.5],
  },
};

export function estimateModelCost(provider: ModelProvider, model: string, usage: ModelUsage): ModelCost {
  if (provider === "ollama") {
    return {
      currency: "USD",
      estimatedUsd: 0,
      inputRatePerMillion: 0,
      cachedInputRatePerMillion: 0,
      cacheWriteRatePerMillion: 0,
      outputRatePerMillion: 0,
      pricingBasis: "Local Ollama execution · no provider token charge",
    };
  }

  const compactRates = PROVIDER_RATES[provider]?.[model];
  if (compactRates) {
    const [inputRate, outputRate] = compactRates;
    return {
      currency: "USD",
      estimatedUsd: ((usage.inputTokens * inputRate) + (usage.outputTokens * outputRate)) / 1_000_000,
      inputRatePerMillion: inputRate,
      cachedInputRatePerMillion: inputRate,
      cacheWriteRatePerMillion: inputRate,
      outputRatePerMillion: outputRate,
      pricingBasis: provider === "gemini"
        ? "Paid-tier equivalent · eligible Gemini free-tier usage may be $0 · August 2, 2026"
        : "Anthropic standard API rates · August 2, 2026",
    };
  }

  const rates = provider === "openai" ? STANDARD_SHORT_CONTEXT_RATES[model] : undefined;
  if (!rates) {
    return {
      currency: "USD",
      estimatedUsd: null,
      inputRatePerMillion: null,
      cachedInputRatePerMillion: null,
      cacheWriteRatePerMillion: null,
      outputRatePerMillion: null,
      pricingBasis: "No rate configured for this model",
    };
  }

  const [inputRate, cachedInputRate, cacheWriteRate, outputRate] = rates;
  const uncachedInputTokens = Math.max(
    0,
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens,
  );
  const estimatedUsd = (
    (uncachedInputTokens * inputRate)
    + (usage.cachedInputTokens * cachedInputRate)
    + (usage.cacheWriteTokens * cacheWriteRate)
    + (usage.outputTokens * outputRate)
  ) / 1_000_000;

  return {
    currency: "USD",
    estimatedUsd,
    inputRatePerMillion: inputRate,
    cachedInputRatePerMillion: cachedInputRate,
    cacheWriteRatePerMillion: cacheWriteRate,
    outputRatePerMillion: outputRate,
    pricingBasis: "OpenAI standard short-context rates · August 2, 2026",
  };
}
