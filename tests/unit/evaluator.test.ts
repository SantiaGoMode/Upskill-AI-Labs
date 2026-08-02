import { describe, expect, it } from "vitest";
import { evaluateCurriculumLab } from "../../app/lib/evaluator";

describe("curriculum evaluator", () => {
  it("passes a complete evidence-linked Lab 2 artifact", () => {
    const result = evaluateCurriculumLab("lab-02", {
      draft: {
        ragStatus: "Amber — NW-PLAN-08",
        statusRationale: "The rehearsal slipped and conflicts with on-track language (NW-PLAN-08, NW-UPDATE-A).",
        achievements: "Identity mapping completed (NW-UPDATE-A).",
        risks: "Migration readiness is 62% (NW-METRICS-05).",
        decisions: "The delivery owner must prepare recovery options; Steering remains human owner (NW-DECISIONS-02).",
        commitments: "Validate the August 9 rehearsal forecast (NW-UPDATE-B).",
      },
      prompt: "Draft from sources only, cite evidence, expose conflicts, use Unknown, and leave decisions to the human owner.",
      selectedSources: ["NW-PLAN-08", "NW-UPDATE-A", "NW-METRICS-05"],
      verification: "Verified all numbers, excluded the stale update, and documented conflicting evidence and Unknown values.",
      secondsRemaining: 900,
    });

    expect(result.passed).toBe(true);
    expect(result.dimensions.grounding.band).toBe("Strong");
    expect(result.completedFields).toBe(6);
  });
});
