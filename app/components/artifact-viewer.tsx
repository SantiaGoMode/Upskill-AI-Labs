"use client";

import type { LabSource, SourceKind, SourceSection } from "../lab-data";
import { Badge, Button, cx } from "./ui";

const KIND_LABEL: Record<SourceKind, string> = {
  email: "Email",
  dashboard: "Dashboard",
  register: "Register",
  plan: "Plan",
  chat: "Chat export",
  policy: "Policy",
  gates: "Control gates",
  schema: "Schema",
  update: "Team update",
  doc: "Document",
};

const STATUS_CLASS = {
  ok: "border-ok-line bg-ok-bg text-ok-fg",
  warn: "border-warn-line bg-warn-bg text-warn-fg",
  risk: "border-risk-line bg-risk-bg text-risk-fg",
} as const;

const TIMELINE_TONE = {
  done: { dot: "bg-ok-fg", label: "Complete", tone: "ok" as const },
  late: { dot: "bg-warn-fg", label: "Late", tone: "warn" as const },
  due: { dot: "bg-[color:var(--line-strong)]", label: "Upcoming", tone: "neutral" as const },
  "at-risk": { dot: "bg-risk-fg", label: "At risk", tone: "risk" as const },
};

/**
 * Renders a lab source as the artifact it represents rather than as undifferentiated
 * prose. A dashboard gets tiles, a register gets a table, an email gets email chrome.
 */
export function ArtifactViewer({
  source,
  onCite,
  reviewed,
  onToggleReviewed,
}: {
  source: LabSource;
  onCite?: (sourceId: string) => void;
  reviewed?: boolean;
  onToggleReviewed?: () => void;
}) {
  const confidential = source.classification !== "Internal";
  const kind = source.kind ?? "doc";

  return (
    <article className="px-6 py-6 md:px-8">
      <header className="mb-5 border-b border-line pb-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{KIND_LABEL[kind]}</Badge>
          <code className="font-mono text-[12.5px] text-muted">{source.id}</code>
          <Badge tone={confidential ? "risk" : "ok"}>{source.classification}</Badge>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h2 className="text-[24px] font-bold">{source.title}</h2>
          <div className="flex items-center gap-2">
            {onCite ? (
              <Button size="sm" onClick={() => onCite(source.id)}>
                Copy {source.id}
              </Button>
            ) : null}
            {onToggleReviewed ? (
              <Button size="sm" variant={reviewed ? "primary" : "secondary"} onClick={onToggleReviewed}>
                {reviewed ? "Reviewed ✓" : "Mark reviewed"}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      {kind === "email" && source.meta ? <EmailChrome meta={source.meta} /> : null}
      {kind !== "email" && source.meta ? (
        <dl className="mb-6 flex flex-wrap gap-x-8 gap-y-2 rounded-[10px] bg-inset px-4 py-3 text-[13px]">
          {source.meta.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted">{label}</dt>
              <dd className="m-0 mt-0.5 font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className={cx(kind === "email" && "rounded-b-[10px] border border-t-0 border-line bg-raised px-5 py-5")}>
        {source.sections.map((section, index) => (
          <SectionView key={index} section={section} kind={kind} />
        ))}
      </div>
    </article>
  );
}

function EmailChrome({ meta }: { meta: Array<[string, string]> }) {
  return (
    <div className="rounded-t-[10px] border border-line bg-inset px-5 py-4">
      <dl className="grid gap-1.5 text-[14px]">
        {meta.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[64px_1fr] gap-3">
            <dt className="text-muted">{label}</dt>
            <dd className="m-0 font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SectionView({ section, kind }: { section: SourceSection; kind: SourceKind }) {
  return (
    <section className="mb-6 last:mb-0">
      {section.heading ? (
        <h3 className="mb-3 font-sans text-[12px] font-bold uppercase tracking-[0.09em] text-subtle">{section.heading}</h3>
      ) : null}

      {section.metrics ? (
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2">
          {section.metrics.map((metric) => (
            <div
              key={metric.label}
              className={cx("rounded-[10px] border px-4 py-3", metric.status ? STATUS_CLASS[metric.status] : "border-line bg-raised")}
            >
              <p className="m-0 text-[12.5px] font-semibold opacity-80">{metric.label}</p>
              <p className="m-0 mt-1 font-display text-[26px] font-bold leading-none tabular-nums">{metric.value}</p>
              {metric.percent !== undefined ? (
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--bg-inset)]">
                  <div className="h-full rounded-full bg-current opacity-70" style={{ width: `${Math.min(100, metric.percent)}%` }} />
                </div>
              ) : null}
              {metric.target ? <p className="m-0 mt-1.5 text-[12px] opacity-75">{metric.target}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {section.gates ? (
        <ul className="mb-4 grid list-none gap-1.5 p-0">
          {section.gates.map((gate) => (
            <li
              key={gate.name}
              className={cx(
                "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[10px] border px-4 py-2.5",
                gate.pass ? "border-ok-line bg-ok-bg" : "border-risk-line bg-risk-bg",
              )}
            >
              <span className="flex items-center gap-2.5 text-[14px] font-semibold">
                <span aria-hidden className={cx("text-[15px]", gate.pass ? "text-ok-fg" : "text-risk-fg")}>
                  {gate.pass ? "✓" : "✕"}
                </span>
                {gate.name}
              </span>
              <span className={cx("text-[13px] tabular-nums", gate.pass ? "text-ok-fg" : "text-risk-fg")}>
                <span className="font-bold">{gate.actual}</span>
                <span className="opacity-70"> against {gate.target}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {section.timeline ? (
        <ol className="mb-4 grid list-none gap-0 p-0">
          {section.timeline.map((item, index) => {
            const tone = TIMELINE_TONE[item.status];
            return (
              <li key={item.label} className="grid grid-cols-[18px_1fr] gap-3">
                <div className="flex flex-col items-center">
                  <span aria-hidden className={cx("mt-1.5 h-2.5 w-2.5 rounded-full", tone.dot)} />
                  {index < section.timeline!.length - 1 ? <span aria-hidden className="w-px flex-1 bg-line" /> : null}
                </div>
                <div className="pb-4">
                  <p className="m-0 text-[14px] font-bold">{item.label}</p>
                  <p className="m-0 mt-0.5 text-[13px] text-muted">
                    Planned {item.planned}
                    {item.actual ? ` · ${item.actual}` : ""}
                  </p>
                  <Badge tone={tone.tone} className="mt-1.5">
                    {tone.label}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {section.chat ? (
        <div className="mb-4 grid gap-2.5">
          {section.chat.map((message, index) => (
            <div key={index} className="rounded-[10px] rounded-tl-[3px] border border-line bg-inset px-4 py-3">
              <p className="m-0 flex flex-wrap items-baseline gap-2 text-[13px]">
                <span className="font-bold">{message.author}</span>
                {message.role ? <span className="text-muted">{message.role}</span> : null}
                {message.time ? <span className="ml-auto font-mono text-[12px] text-subtle">{message.time}</span> : null}
              </p>
              <p className="m-0 mt-1.5 text-[14px] leading-relaxed">{message.text}</p>
            </div>
          ))}
        </div>
      ) : null}

      {section.table ? (
        <div className="mb-4 overflow-x-auto rounded-[10px] border border-line">
          <table className="w-full min-w-[420px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line bg-inset text-left">
                {section.table.head.map((cell) => (
                  <th key={cell} className="px-3.5 py-2.5 font-bold">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row) => (
                <tr key={row.join("|")} className="border-b border-line last:border-b-0">
                  {row.map((cell, index) => (
                    <td key={index} className={cx("px-3.5 py-2.5 align-top", index === 0 && "font-mono text-[13px] font-semibold")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {section.fields ? (
        <ol className="mb-4 grid list-none grid-cols-2 gap-1.5 p-0 sm:grid-cols-3">
          {section.fields.map((field, index) => (
            <li key={field} className="rounded-[7px] border border-line bg-raised px-2.5 py-2 text-[13px]">
              <span className="mr-1.5 font-mono text-[11px] text-subtle">{String(index + 1).padStart(2, "0")}</span>
              {field}
            </li>
          ))}
        </ol>
      ) : null}

      <div className={cx("prose-doc max-w-[68ch]", kind === "policy" && "border-l-2 border-line pl-4")}>
        {section.paragraphs?.map((text) => (
          <p key={text}>{text}</p>
        ))}
        {section.bullets ? (
          <ul>
            {section.bullets.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {section.callout ? (
        <div className="my-5 rounded-[10px] border border-risk-line bg-risk-bg px-4 py-4">
          <p className="eyebrow !text-risk-fg">{section.callout.label}</p>
          <p className="mt-2 font-mono text-[14px] font-bold text-risk-fg">{section.callout.title}</p>
          <p className="mt-1.5 mb-0 text-[13px] leading-relaxed text-risk-fg opacity-90">{section.callout.body}</p>
        </div>
      ) : null}
    </section>
  );
}
