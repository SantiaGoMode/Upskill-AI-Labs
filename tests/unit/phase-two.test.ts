import { describe, expect, it } from "vitest";
import { buildRecipe } from "../../app/lib/recipe-engine";
import { artifactShapeFromText, proposeWorkflows } from "../../app/lib/redaction";

describe("Phase 2 client-side redaction", () => {
  it("retains document structure without leaking source values", () => {
    const raw = "# Status\nOwner: Elena Marquez\nEmail: elena@example.com\nBudget: $684,000\n- Risk one\n- Risk two";
    const shape = artifactShapeFromText("Beacon weekly status.md", raw);
    const serialized = JSON.stringify(shape);
    expect(shape.markers.emails).toBe(1);
    expect(shape.markers.currency).toBe(1);
    expect(shape.listItems).toBe(2);
    expect(serialized).not.toContain("Elena");
    expect(serialized).not.toContain("elena@example.com");
    expect(serialized).not.toContain("684,000");
  });
});

describe("Phase 2 recipe engine", () => {
  it("preserves all eight assessed labs and exposes adaptations", () => {
    const workflows = proposeWorkflows("Senior program manager responsible for delivery and governance", "Technology", []);
    const recipe = buildRecipe({ workflows, priorityWorkflowIds: workflows.slice(0, 3).map((item) => item.id), industry: "Technology", seniority: "Director", developingDimensions: ["grounding"] });
    expect(recipe.route.map((item) => item.labId)).toEqual(["lab-01", "lab-02", "lab-03", "lab-04", "lab-05", "lab-06", "lab-07", "lab-08"]);
    expect(recipe.route.slice(0, 3).every((item) => item.mode === "remediation")).toBe(true);
    expect(recipe.route.every((item) => item.reason.length > 20)).toBe(true);
  });
});
