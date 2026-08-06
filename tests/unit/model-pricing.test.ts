import { describe, expect, it } from "vitest";
import { estimateModelCost } from "../../app/lib/model-pricing";

const usage = {
  inputTokens: 1_000,
  cachedInputTokens: 100,
  cacheWriteTokens: 50,
  outputTokens: 200,
  reasoningTokens: 0,
  totalTokens: 1_200,
};

describe("model pricing", () => {
  it("calculates OpenAI cache-aware cost", () => {
    const cost = estimateModelCost("openai", "gpt-5.6-sol", usage);
    expect(cost.estimatedUsd).toBeCloseTo(0.0106125, 8);
  });

  it("reports Gemini paid-tier equivalent while noting free-tier eligibility", () => {
    const cost = estimateModelCost("gemini", "gemini-3.5-flash-lite", usage);
    expect(cost.estimatedUsd).toBeCloseTo(0.0008, 8);
    expect(cost.pricingBasis).toContain("free-tier");
  });

  // Pins the published Anthropic rates ($1.00 / $5.00 per million tokens for
  // Claude Haiku 4.5). The daily spend cap is derived from these numbers, so a
  // wrong rate silently doubles or halves every learner's effective budget.
  it("prices Anthropic at the published per-million rates, by alias and dated id", () => {
    for (const model of ["claude-haiku-4-5", "claude-haiku-4-5-20251001"]) {
      const cost = estimateModelCost("anthropic", model, usage);
      expect(cost.inputRatePerMillion).toBe(1);
      expect(cost.outputRatePerMillion).toBe(5);
      expect(cost.estimatedUsd).toBeCloseTo(0.002, 8);
    }
  });

  it("reports unmetered rather than guessing at an unknown model", () => {
    const cost = estimateModelCost("anthropic", "claude-not-a-real-model", usage);
    expect(cost.estimatedUsd).toBeNull();
    expect(cost.pricingBasis).toContain("No rate configured");
  });

  it("treats local Ollama tokens as zero provider cost", () => {
    expect(estimateModelCost("ollama", "gemma4", usage).estimatedUsd).toBe(0);
  });
});
