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

  it("treats local Ollama tokens as zero provider cost", () => {
    expect(estimateModelCost("ollama", "gemma4", usage).estimatedUsd).toBe(0);
  });
});
