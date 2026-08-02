import type { WorkflowCandidate } from "./redaction";

export type RecipeNode = {
  labId: string;
  order: number;
  title: string;
  mode: "standard" | "compressed" | "remediation";
  minutes: number;
  workflowId: string | null;
  reason: string;
};

const spine = [
  ["lab-01", "Intake and structure", 30],
  ["lab-02", "Draft from evidence", 35],
  ["lab-03", "Synthesize many", 40],
  ["lab-04", "Prepare a decision", 35],
  ["lab-05", "Build an executable plan", 40],
  ["lab-06", "Build the jig", 45],
  ["lab-07", "Audit the narrative", 35],
  ["lab-08", "Evaluate and promote", 45],
] as const;

export function buildRecipe(input: {
  workflows: WorkflowCandidate[];
  priorityWorkflowIds: string[];
  industry: string;
  seniority: string;
  developingDimensions?: string[];
}) {
  const priorities = input.priorityWorkflowIds
    .map((id) => input.workflows.find((workflow) => workflow.id === id))
    .filter((item): item is WorkflowCandidate => Boolean(item));
  const remediation = new Set(input.developingDimensions ?? []);
  const route: RecipeNode[] = spine.map(([labId, title, baseMinutes], index) => {
    const workflow = priorities[index % Math.max(priorities.length, 1)] ?? null;
    const needsRemediation = (index < 3 && remediation.has("grounding"))
      || (index >= 3 && index < 6 && remediation.has("judgment"))
      || (index >= 6 && remediation.has("guardrails"));
    const experienced = /senior|lead|director|vp|head/i.test(input.seniority);
    const mode = needsRemediation ? "remediation" : experienced && index < 2 ? "compressed" : "standard";
    const minutes = mode === "remediation" ? baseMinutes + 15 : mode === "compressed" ? baseMinutes - 10 : baseMinutes;
    return {
      labId,
      order: index + 1,
      title,
      mode,
      minutes,
      workflowId: workflow?.id ?? null,
      reason: needsRemediation
        ? `Additional practice responds to developing ${[...remediation].join(" and ")} evidence.`
        : workflow
          ? `Scenario skin uses “${workflow.name}” in ${input.industry || "your context"}.`
          : "Core assessed spine retained; add priority workflows to personalize its scenario skin.",
    };
  });
  return {
    recipeVersion: "phase2-v1",
    route,
    estimatedMinutes: route.reduce((sum, node) => sum + node.minutes, 0),
    adaptations: {
      fixedSpine: spine.map(([id]) => id),
      priorityWorkflowIds: priorities.map((item) => item.id),
      industry: input.industry,
      seniority: input.seniority,
      developingDimensions: [...remediation],
    },
  };
}
