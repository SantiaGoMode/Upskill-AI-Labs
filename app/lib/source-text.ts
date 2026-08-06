import { labById } from "./labs";
import type { Policy } from "./governance";
import { permitsDataClass } from "./governance";
import type { LabSource, SourceSection } from "../lab-data";

/**
 * Flattens lab sources into prompt text.
 *
 * Data-class enforcement lives here rather than at the call site: a source the
 * active policy does not permit is never rendered, so a confidential artifact
 * dragged onto the shared canvas still cannot reach a model.
 */

const normalizedClass = (source: LabSource) => (source.classification === "Internal" ? "Internal" : "Confidential");

function sectionText(section: SourceSection): string {
  const parts: string[] = [];
  if (section.heading) parts.push(section.heading);
  if (section.paragraphs) parts.push(...section.paragraphs);
  if (section.bullets) parts.push(...section.bullets.map((bullet) => `- ${bullet}`));
  if (section.metrics) {
    parts.push(...section.metrics.map((metric) => `- ${metric.label}: ${metric.value}${metric.target ? ` (${metric.target})` : ""}`));
  }
  if (section.gates) {
    parts.push(...section.gates.map((gate) => `- ${gate.name}: ${gate.actual} against target ${gate.target} — ${gate.pass ? "PASS" : "FAIL"}`));
  }
  if (section.timeline) {
    parts.push(...section.timeline.map((item) => `- ${item.label}: planned ${item.planned}${item.actual ? `, ${item.actual}` : ""} (${item.status})`));
  }
  if (section.chat) parts.push(...section.chat.map((message) => `${message.author}: ${message.text}`));
  if (section.table) {
    parts.push(section.table.head.join(" | "));
    parts.push(...section.table.rows.map((row) => row.join(" | ")));
  }
  if (section.fields) parts.push(...section.fields.map((field) => `- ${field}`));
  if (section.callout) parts.push(`[${section.callout.label}] ${section.callout.title} — ${section.callout.body}`);
  return parts.filter(Boolean).join("\n");
}

export type ResolvedSources = { text: string; used: string[]; blocked: string[] };

export function resolveSourceText(labId: string, sourceIds: string[], policy: Policy): ResolvedSources {
  const lab = labById(labId);
  const used: string[] = [];
  const blocked: string[] = [];
  if (!lab) return { text: "", used, blocked: sourceIds };

  const blocks = sourceIds.map((sourceId) => {
    const source = lab.sources.find((candidate) => candidate.id === sourceId);
    if (!source) {
      blocked.push(sourceId);
      return null;
    }
    if (!permitsDataClass(policy, normalizedClass(source))) {
      blocked.push(sourceId);
      return null;
    }
    used.push(source.id);
    return `SOURCE ${source.id}: ${source.title}\n${source.sections.map(sectionText).filter(Boolean).join("\n\n")}`;
  });

  return { text: blocks.filter((block): block is string => Boolean(block)).join("\n\n---\n\n"), used, blocked };
}
