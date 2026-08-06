"use client";

import type { PersistedModelRun } from "../lib/model-run-types";
import type { Lab, LabField } from "../lib/labs";
import { Badge, Button, Callout, Card, cx, LinkButton } from "./ui";

export type Stage = "brief" | "evidence" | "workbench" | "draft" | "submit";

export const STAGES: Array<{ id: Stage; label: string; hint: string }> = [
  { id: "brief", label: "Brief", hint: "What you are producing and why" },
  { id: "evidence", label: "Evidence", hint: "Read the source pack" },
  { id: "workbench", label: "Workbench", hint: "Build and test a prompt" },
  { id: "draft", label: "Draft", hint: "Write the deliverable" },
  { id: "submit", label: "Submit", hint: "Verify, then hand it in" },
];

const RUBRIC = [
  ["Grounding", "Material claims trace to a source ID"],
  ["Completeness", "Every section present; gaps marked Unknown"],
  ["Judgment", "A human owns the consequential decision"],
  ["Efficiency", "The prompt is reusable, not one-off"],
  ["Guardrails", "Data boundary respected and documented"],
];

export function StageBar({
  stage,
  onChange,
  done,
}: {
  stage: Stage;
  onChange: (stage: Stage) => void;
  done: Record<Stage, boolean>;
}) {
  const currentIndex = STAGES.findIndex((item) => item.id === stage);
  return (
    <nav aria-label="Lab stages" className="border-b border-line bg-raised">
      <ol className="m-0 flex list-none gap-1 overflow-x-auto px-4 py-2">
        {STAGES.map((item, index) => {
          const active = item.id === stage;
          const complete = done[item.id];
          return (
            <li key={item.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onChange(item.id)}
                aria-current={active ? "step" : undefined}
                className={cx(
                  "flex min-w-[132px] items-center gap-2.5 rounded-[9px] px-3 py-2 text-left transition-colors",
                  active ? "bg-primary text-primary-fg" : "hover:bg-inset",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[11px] font-bold",
                    active
                      ? "bg-[color:var(--bg-raised)] text-[color:var(--primary)]"
                      : complete
                        ? "bg-ok-fg text-[color:var(--bg-raised)]"
                        : "bg-inset text-subtle",
                  )}
                >
                  {complete && !active ? "✓" : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-bold">{item.label}</span>
                  <span className={cx("block truncate text-[11.5px]", active ? "opacity-75" : "text-subtle")}>{item.hint}</span>
                </span>
              </button>
              {index < STAGES.length - 1 ? (
                <span aria-hidden className={cx("text-[13px]", index < currentIndex ? "text-ok-fg" : "text-subtle")}>
                  ›
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function BriefStage({ lab, moduleHref, onStart }: { lab: Lab; moduleHref: string | null; onStart: () => void }) {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-8 md:px-8">
      <p className="eyebrow mb-2">The situation</p>
      <p className="text-[17px] leading-[1.7]">{lab.brief}</p>

      <Card className="mt-6 border-l-[3px] border-l-accent px-5 py-4">
        <p className="eyebrow mb-1.5">What you hand in</p>
        <p className="m-0 text-[15px] leading-relaxed">{lab.deliverable}</p>
      </Card>

      {lab.steps.length ? (
        <>
          <h2 className="mb-3 mt-8 text-[19px] font-bold">How to work through it</h2>
          <ol className="m-0 grid list-none gap-2 p-0">
            {lab.steps.map((step, index) => (
              <li key={step} className="grid grid-cols-[26px_1fr] gap-3 rounded-[10px] border border-line bg-raised px-4 py-3">
                <span className="mt-0.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-inset text-[12px] font-bold text-muted">
                  {index + 1}
                </span>
                <span className="text-[14.5px] leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {lab.watchFor.length ? (
        <>
          <h2 className="mb-3 mt-8 text-[19px] font-bold">What to watch for</h2>
          <Callout tone="warn">
            <ul className="m-0 list-disc pl-5">
              {lab.watchFor.map((item) => (
                <li key={item} className="mb-1 last:mb-0">
                  {item}
                </li>
              ))}
            </ul>
          </Callout>
        </>
      ) : null}

      <h2 className="mb-3 mt-8 text-[19px] font-bold">How it is scored</h2>
      <div className="overflow-hidden rounded-[10px] border border-line">
        {RUBRIC.map(([name, description], index) => (
          <div key={name} className={cx("flex flex-wrap gap-x-4 px-4 py-2.5 text-[14px]", index > 0 && "border-t border-line")}>
            <span className="w-[110px] shrink-0 font-bold">{name}</span>
            <span className="text-muted">{description}</span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[13px] text-muted">
        You are graded on process, not prose. Guardrails must not be Developing, and at most one other dimension may be.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button variant="primary" onClick={onStart}>
          Start the lab →
        </Button>
        {moduleHref ? (
          <LinkButton variant="ghost" href={moduleHref}>
            Re-read the worked example
          </LinkButton>
        ) : null}
      </div>
    </div>
  );
}

/** One field of the deliverable, with the interactive helpers that make drafting quicker. */
export function DeliverableField({
  field,
  value,
  onChange,
  sourceIds,
}: {
  field: LabField;
  value: string;
  onChange: (key: string, value: string) => void;
  sourceIds: string[];
}) {
  const control =
    "w-full rounded-[8px] border border-line bg-raised px-3 py-2.5 text-[14px] text-fg placeholder:text-subtle focus:border-primary focus:outline-none";
  const isUnknown = /^unknown\b/i.test(value.trim());
  const cited = sourceIds.filter((id) => value.includes(id));

  function append(text: string) {
    const next = value.trim() ? `${value.trim()} ${text}` : text;
    onChange(field.key, next);
  }

  return (
    <div className="rounded-[10px] border border-line bg-bg p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`field-${field.key}`} className="text-[13.5px] font-bold">
          {field.label}
        </label>
        <div className="flex items-center gap-1.5">
          {cited.length ? <Badge tone="ok">{cited.length} cited</Badge> : null}
          {isUnknown ? <Badge tone="neutral">Unknown</Badge> : null}
        </div>
      </div>

      {field.kind === "select" ? (
        <select id={`field-${field.key}`} className={control} value={value} onChange={(event) => onChange(field.key, event.target.value)}>
          <option value="">Choose from evidence</option>
          {field.options?.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : field.kind === "textarea" ? (
        <textarea
          id={`field-${field.key}`}
          className={cx(control, "resize-y leading-relaxed")}
          rows={4}
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      ) : (
        <input
          id={`field-${field.key}`}
          className={control}
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      )}

      {field.kind !== "select" ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(field.key, "Unknown")}
            className="rounded-[6px] border border-line-strong px-2 py-1 text-[11.5px] font-semibold text-muted transition-colors hover:bg-inset hover:text-fg"
          >
            Mark Unknown
          </button>
          <span aria-hidden className="text-[11px] text-subtle">
            cite:
          </span>
          {sourceIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => append(`[${id}]`)}
              className={cx(
                "rounded-[6px] border px-2 py-1 font-mono text-[11px] transition-colors",
                value.includes(id)
                  ? "border-ok-line bg-ok-bg text-ok-fg"
                  : "border-line text-muted hover:border-line-strong hover:text-fg",
              )}
            >
              {id}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The last model run, collapsed, beside the draft.
 *
 * Verification means reading the output against the source it names, which
 * previously meant leaving the draft for the workbench and holding the values
 * in your head. This is read-only and stays closed by default: it is reference
 * material for checking, not a panel to transcribe from.
 */
export function OutputReference({ run, onOpenWorkbench }: { run: PersistedModelRun | null; onOpenWorkbench: () => void }) {
  if (!run) {
    return (
      <div className="rounded-[12px] border border-line bg-raised px-4 py-3">
        <p className="eyebrow">Model output</p>
        <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-muted">
          Nothing run yet. Build an extraction prompt in the{" "}
          <button type="button" onClick={onOpenWorkbench} className="font-semibold text-fg underline">
            workbench
          </button>{" "}
          and its output appears here while you draft.
        </p>
      </div>
    );
  }

  return (
    <details className="overflow-hidden rounded-[12px] border border-line bg-raised">
      <summary className="cursor-pointer px-4 py-3 text-[13px] font-semibold">
        Model output <span className="font-mono font-normal text-muted">· {run.provider}</span>
      </summary>
      <pre className="m-0 max-h-[320px] overflow-auto whitespace-pre-wrap border-t border-line px-4 py-3 font-mono text-[12px] leading-relaxed">
        {run.outputText}
      </pre>
      <p className="m-0 border-t border-line px-4 py-2.5 text-[12px] leading-relaxed text-muted">
        Check every value against the source it names, then cite that source — not this output.
      </p>
    </details>
  );
}

export type PreflightCheck = { label: string; passed: boolean; detail: string; blocking: boolean };

export function PreflightPanel({ checks }: { checks: PreflightCheck[] }) {
  const blocking = checks.filter((check) => check.blocking && !check.passed);
  return (
    <div className="rounded-[12px] border border-line bg-raised">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="eyebrow">Pre-flight checks</p>
        <Badge tone={blocking.length ? "risk" : "ok"}>
          {blocking.length ? `${blocking.length} blocking` : "Ready"}
        </Badge>
      </div>
      <ul className="m-0 list-none p-0">
        {checks.map((check, index) => (
          <li key={check.label} className={cx("grid grid-cols-[20px_1fr] gap-2.5 px-4 py-2.5", index > 0 && "border-t border-line")}>
            <span
              aria-hidden
              className={cx(
                "mt-[3px] text-[13px] font-bold",
                check.passed ? "text-ok-fg" : check.blocking ? "text-risk-fg" : "text-warn-fg",
              )}
            >
              {check.passed ? "✓" : check.blocking ? "✕" : "!"}
            </span>
            <span>
              <span className="block text-[13.5px] font-semibold">{check.label}</span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{check.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
