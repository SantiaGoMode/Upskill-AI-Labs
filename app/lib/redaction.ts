export type IntakeTier = "T0" | "T1" | "T2";

export type ArtifactShape = {
  name: string;
  extension: string;
  lengthBucket: "short" | "medium" | "long";
  characters: number;
  lines: number;
  paragraphs: number;
  headings: number;
  listItems: number;
  tableRows: number;
  tableColumns: number;
  formFields: number;
  markers: { dates: number; emails: number; phones: number; currency: number };
};

export type WorkflowCandidate = {
  id: string;
  name: string;
  trigger: string;
  outcome: string;
  frequency: "daily" | "weekly" | "monthly" | "ad hoc";
  evidence: string;
};

const count = (text: string, expression: RegExp) => text.match(expression)?.length ?? 0;

/** Runs only in the browser. The returned structural profile contains no source text. */
export function artifactShapeFromText(name: string, text: string): ArtifactShape {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80) || "artifact.txt";
  const lines = text.split(/\r?\n/);
  const tableLines = lines.filter((line) => line.includes("|") || line.split("\t").length > 2);
  return {
    name: safeName,
    extension: safeName.includes(".") ? safeName.split(".").pop()!.toLowerCase() : "unknown",
    lengthBucket: text.length < 1_500 ? "short" : text.length < 10_000 ? "medium" : "long",
    characters: text.length,
    lines: lines.length,
    paragraphs: text.trim() ? text.trim().split(/\n\s*\n/).length : 0,
    headings: lines.filter((line) => /^\s{0,3}#{1,6}\s|^[A-Z][A-Z\s\d&/-]{4,}:?\s*$/.test(line)).length,
    listItems: lines.filter((line) => /^\s*(?:[-*+] |\d+[.)] )/.test(line)).length,
    tableRows: tableLines.length,
    tableColumns: tableLines.reduce((max, line) => Math.max(max, line.includes("|") ? line.split("|").filter(Boolean).length : line.split("\t").length), 0),
    formFields: lines.filter((line) => /^[^:\n]{2,40}:\s*\S?/.test(line)).length,
    markers: {
      dates: count(text, /\b(?:\d{1,2}[/-]){2}\d{2,4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/gi),
      emails: count(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi),
      phones: count(text, /(?:\+?\d[\d(). -]{7,}\d)/g),
      currency: count(text, /[$€£]\s?\d|\bUSD\b|\bEUR\b|\bGBP\b/gi),
    },
  };
}

export function isArtifactShape(value: unknown): value is ArtifactShape {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.name === "string" && typeof item.extension === "string"
    && ["short", "medium", "long"].includes(String(item.lengthBucket))
    && ["characters", "lines", "paragraphs", "headings", "listItems", "tableRows", "tableColumns", "formFields"]
      .every((key) => Number.isInteger(item[key]) && Number(item[key]) >= 0)
    && Boolean(item.markers) && typeof item.markers === "object";
}

export function proposeWorkflows(roleDescription: string, industry: string, shapes: ArtifactShape[]): WorkflowCandidate[] {
  const context = industry.trim() || "your organization";
  const structuralEvidence = shapes.length
    ? `${shapes.length} redacted artifact shape${shapes.length === 1 ? "" : "s"}`
    : "role description only";
  const roleSignal = roleDescription.trim().slice(0, 80) || "program delivery";
  const definitions: Array<Omit<WorkflowCandidate, "id" | "evidence">> = [
    { name: "Turn intake into a decision-ready brief", trigger: "A new request or initiative arrives", outcome: "Scoped brief with unknowns and owners", frequency: "weekly" },
    { name: "Draft evidence-linked program status", trigger: "The reporting window closes", outcome: "Verified RAG narrative and decisions", frequency: "weekly" },
    { name: "Consolidate risks and dependencies", trigger: "Signals change across workstreams", outcome: "Deduplicated prioritized risk picture", frequency: "weekly" },
    { name: "Prepare governance decisions", trigger: "A steering decision is required", outcome: "Options, tradeoffs, recommendation, and human owner", frequency: "monthly" },
    { name: "Build an executable delivery plan", trigger: "Scope or dates are approved", outcome: "Milestones, acceptance tests, dependencies, and confidence", frequency: "ad hoc" },
    { name: "Audit an executive narrative", trigger: "A material claim will be published", outcome: "Source-linked claim ledger and corrections", frequency: "monthly" },
    { name: "Analyze stakeholder feedback", trigger: "Feedback or research is collected", outcome: "Themes, contradictions, and next actions", frequency: "monthly" },
    { name: "Create a reusable AI-assisted workflow", trigger: "A recurring task stabilizes", outcome: "Versioned jig with tests and escalation rules", frequency: "ad hoc" },
    { name: "Measure workflow impact", trigger: "A workflow has been used in practice", outcome: "Baseline comparison and adoption decision", frequency: "monthly" },
  ];
  return definitions.map((workflow, index) => ({
    ...workflow,
    id: `workflow-${index + 1}`,
    evidence: `${structuralEvidence}; ${context}; ${roleSignal}`,
  }));
}
