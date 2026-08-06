/** Kept separate from the renderer so the content schema stays server-safe. */
export const DIAGRAM_IDS = [
  "next-token",
  "context-window",
  "hallucination-loop",
  "help-vs-hurt",
  "data-classes",
  "verification-loop",
  "play-map",
  "jig-lifecycle",
  "evidence-chain",
] as const;

export type DiagramId = (typeof DIAGRAM_IDS)[number];
