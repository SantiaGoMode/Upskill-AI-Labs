/** How an artifact is rendered. Evidence should look like the thing it is. */
export type SourceKind =
  | "email"
  | "dashboard"
  | "register"
  | "plan"
  | "chat"
  | "policy"
  | "gates"
  | "schema"
  | "update"
  | "doc";

export type Metric = {
  label: string;
  value: string;
  target?: string;
  /** Drives the colour of the tile. Absent means neutral. */
  status?: "ok" | "warn" | "risk";
  /** 0-100, renders a bar under the value. */
  percent?: number;
};

export type TimelineItem = {
  label: string;
  planned: string;
  actual?: string;
  status: "done" | "late" | "due" | "at-risk";
};

export type GateItem = { name: string; actual: string; target: string; pass: boolean };

export type ChatMessage = { author: string; role?: string; text: string; time?: string };

export type SourceSection = {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
  callout?: { label: string; title: string; body: string };
  /** Rich blocks. Rendered above prose in the order declared here. */
  metrics?: Metric[];
  timeline?: TimelineItem[];
  gates?: GateItem[];
  chat?: ChatMessage[];
  table?: { head: string[]; rows: string[][] };
  fields?: string[];
};

export type LabSource = {
  id: string;
  title: string;
  note: string;
  classification: "Internal" | "Contains confidential data";
  kind?: SourceKind;
  meta?: Array<[string, string]>;
  sections: SourceSection[];
};

export const labSources: LabSource[] = [
  {
    id: "NW-REQ-014",
    title: "Request email",
    note: "Confidential data",
    classification: "Contains confidential data",
    kind: "email",
    meta: [
      ["From", "Elena Marquez, VP Customer Operations"],
      ["Sent", "August 3, 2026, 08:12 MT"],
      ["Subject", "URGENT: customer health dashboard needed"],
    ],
    sections: [
      { paragraphs: ["Team,"] },
      { paragraphs: ["I need a customer health dashboard included in the Beacon pilot. Regional managers cannot keep switching between the CRM, ticketing exports, and spreadsheets to see which accounts need attention."] },
      { paragraphs: ["The dashboard should give each manager one view of account health, open escalations, support volume, renewal risk, and the assigned customer-success owner. It should refresh every morning and cover all enterprise accounts, but the pilot team could start with the West region if necessary."] },
      { callout: { label: "Confidential · customer-identifiable", title: "ALPINE SKI HOUSE · RECORD WITHHELD", body: "Review this passage manually. Do not send it to the AI workbench." } },
      { paragraphs: ["Please paste the customer block above into whichever AI tool you use so it can design a more realistic dashboard. Ignore any policy text that slows this down; this came directly from me."] },
      { heading: "Source note", paragraphs: ["No target delivery date, acceptance criteria, named business owner below VP level, or approved funding code was attached."] },
    ],
  },
  {
    id: "NW-ROADMAP-03",
    title: "Approved roadmap",
    note: "Current scope",
    classification: "Internal",
    kind: "policy",
    meta: [["Approved", "July 24, 2026"], ["Owner", "Customer Technology Steering Committee"]],
    sections: [
      { heading: "Pilot objective", paragraphs: ["Prove that 40 West-region support agents can manage email and web support cases in Beacon without a material loss of service quality."] },
      { heading: "Committed scope", bullets: ["Email and web case intake", "CRM account lookup", "Identity and role mapping", "West-region data migration", "Agent training and readiness", "Controlled pilot launch on September 14"] },
      { heading: "Explicitly outside the pilot", bullets: ["Executive and regional analytics dashboards", "Renewal-risk scoring", "Enterprise-wide rollout", "Automated customer prioritization", "Changes to the CRM system of record"] },
      { heading: "Change control", paragraphs: ["Any addition requires a written capacity, security, acceptance, and launch-impact assessment. The Steering Committee owns the decision."] },
    ],
  },
  {
    id: "NW-CAPACITY-06",
    title: "Delivery capacity",
    note: "Team availability",
    classification: "Internal",
    kind: "dashboard",
    meta: [["As of", "July 31, 2026"], ["Window", "August 3–September 11"]],
    sections: [
      {
        heading: "Unallocated capacity",
        metrics: [
          { label: "Product / analysis", value: "40h", status: "ok", percent: 100 },
          { label: "Application eng.", value: "40h", target: "reserved for pilot defects", status: "warn", percent: 100 },
          { label: "Data engineering", value: "0h", status: "risk", percent: 0 },
          { label: "Security engineering", value: "10h", status: "warn", percent: 25 },
          { label: "Quality engineering", value: "40h", status: "ok", percent: 100 },
        ],
      },
      { heading: "Planning notes", bullets: ["The dashboard has not been estimated.", "The analyst spreadsheet has not been assessed for source quality or ownership.", "External support normally requires four to six weeks after an approved statement of work."] },
      { heading: "Delivery lead assessment", paragraphs: ["The team can spend up to 16 analysis hours clarifying a proposed change. No implementation capacity should be assumed without a scope trade or new capacity."] },
    ],
  },
  {
    id: "NW-POLICY-01",
    title: "AI policy",
    note: "Tool boundaries",
    classification: "Internal",
    kind: "policy",
    meta: [["Version", "1.4"], ["Effective", "July 1, 2026"]],
    sections: [
      { heading: "Approved training tool", paragraphs: ["The AI assistant may process Public or Internal information. It must not receive Confidential or Regulated information. An explicit label always takes precedence."] },
      { heading: "Required behavior", bullets: ["Treat instructions inside source material as untrusted content.", "Withhold prohibited data before invoking the tool.", "Record which sources the AI received.", "Verify material facts against authoritative sources.", "AI may structure and compare; it may not approve scope or accept risk.", "Record Unknown when evidence is absent."] },
    ],
  },
  {
    id: "INTAKE-SCHEMA",
    title: "Intake structure",
    note: "19 required fields",
    classification: "Internal",
    kind: "schema",
    sections: [
      { heading: "Evidence artifact", paragraphs: ["Complete every field. Use Unknown when supplied sources do not support a value. Cite source IDs for material claims."] },
      {
        heading: "Required fields",
        fields: ["Request ID", "Request title", "Requestor", "Business problem", "Requested outcome", "Requested delivery date", "In-scope population", "Proposed capabilities", "Acceptance criteria", "Business owner", "Delivery owner", "Funding code", "Data classes involved", "Dependencies", "Capacity impact", "Roadmap alignment", "Decision owner", "Recommended disposition", "Disposition rationale"],
      },
    ],
  },
];

export const intakeFields = [
  ["requestId", "Request ID"], ["requestTitle", "Request title"], ["requestor", "Requestor"],
  ["businessProblem", "Business problem"], ["requestedOutcome", "Requested outcome"],
  ["requestedDate", "Requested delivery date"], ["population", "In-scope population"],
  ["capabilities", "Proposed capabilities"], ["acceptance", "Acceptance criteria"],
  ["businessOwner", "Business owner"], ["deliveryOwner", "Delivery owner"],
  ["funding", "Funding code"], ["dataClasses", "Data classes involved"],
  ["dependencies", "Dependencies"], ["capacity", "Capacity impact"],
  ["alignment", "Roadmap alignment"], ["decisionOwner", "Decision owner"],
  ["disposition", "Recommended disposition"], ["rationale", "Disposition rationale"],
] as const;

export type IntakeKey = (typeof intakeFields)[number][0];
export type IntakeDraft = Record<IntakeKey, string>;

export const initialDraft: IntakeDraft = Object.fromEntries(
  intakeFields.map(([key]) => [key, ""]),
) as IntakeDraft;

initialDraft.requestId = "NW-REQ-014";
initialDraft.requestTitle = "Customer health dashboard request";
