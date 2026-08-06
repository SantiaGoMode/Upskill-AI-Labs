import type { DiagramId } from "./diagram-ids";

/**
 * The course content model.
 *
 * Lessons are built from typed blocks rather than free HTML so that every
 * lesson renders in one visual language, stays theme-aware, and can later be
 * authored through Trainer Studio without a rich-text editor.
 */

export type Tone = "neutral" | "ok" | "warn" | "risk" | "info";

/** The four assistants this curriculum teaches against. */
export const TOOLS = ["Copilot", "Gemini", "Claude", "ChatGPT"] as const;
export type ToolName = (typeof TOOLS)[number];

export type PromptAnnotation = {
  /** Text fragment inside the prompt this note explains. */
  quote: string;
  note: string;
};

export type Block =
  | { kind: "para"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "list"; items: string[]; ordered?: boolean }
  | { kind: "callout"; tone: Tone; title?: string; text: string }
  | { kind: "diagram"; id: DiagramId; caption?: string }
  | { kind: "keyTerm"; term: string; definition: string; also?: string }
  | { kind: "steps"; items: Array<{ title: string; text: string }> }
  | { kind: "table"; head: string[]; rows: string[][]; caption?: string }
  /** A prompt the learner can read, copy, and reuse. */
  | { kind: "prompt"; label: string; text: string; annotations?: PromptAnnotation[] }
  /** Illustrative model output, marked so nobody mistakes it for ground truth. */
  | { kind: "output"; label: string; text: string; verdict: "good" | "flawed"; note: string }
  /** Side-by-side guidance for the same task across assistants. */
  | { kind: "toolCompare"; task: string; entries: Array<{ tool: ToolName; text: string }> }
  /** A short list of real situations where the play applies. */
  | { kind: "useCases"; items: Array<{ situation: string; play: string }> };

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  /** Index into `options`. */
  answer: number;
  explanation: string;
};

export type LessonKind = "concept" | "example" | "tools" | "lab" | "check" | "reflection";

export type Lesson = {
  id: string;
  kind: LessonKind;
  title: string;
  /** One line shown in module lists. */
  summary: string;
  minutes: number;
  blocks?: Block[];
  /** Set on `lab` lessons; links into the existing lab runner. */
  labId?: string;
  /** Set on `check` lessons. */
  questions?: QuizQuestion[];
  /** Set on `reflection` lessons. */
  reflectionPrompts?: string[];
};

export type Module = {
  id: string;
  number: number;
  title: string;
  eyebrow: string;
  summary: string;
  /** What the learner can do afterwards, in plain language. */
  outcomes: string[];
  lessons: Lesson[];
};

export type Course = {
  id: string;
  title: string;
  subtitle: string;
  modules: Module[];
};

export const LESSON_KIND_LABEL: Record<LessonKind, string> = {
  concept: "Read",
  example: "Worked example",
  tools: "Tool guide",
  lab: "Lab",
  check: "Knowledge check",
  reflection: "Reflection",
};

export const lessonMinutes = (module: Module) => module.lessons.reduce((total, lesson) => total + lesson.minutes, 0);
