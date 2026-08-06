"use client";

import Link from "next/link";
import { lessonHref } from "../content/course";
import type { Lesson, Module } from "../content/schema";
import { LESSON_KIND_LABEL } from "../content/schema";
import type { ProgressRow } from "../lib/use-progress";
import { Badge, cx } from "./ui";

const KIND_TONE: Record<Lesson["kind"], "neutral" | "info" | "warn"> = {
  concept: "neutral",
  example: "info",
  tools: "info",
  lab: "warn",
  check: "neutral",
  reflection: "neutral",
};

const KIND_ICON: Record<Lesson["kind"], string> = {
  concept: "▤",
  example: "◈",
  tools: "⌥",
  lab: "▶",
  check: "✓",
  reflection: "✎",
};

export function LessonRow({
  courseModule,
  lesson,
  progress,
}: {
  courseModule: Module;
  lesson: Lesson;
  progress?: ProgressRow;
}) {
  const done = Boolean(progress);

  return (
    <Link
      href={lessonHref({ courseModule, lesson })}
      className={cx(
        "grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-[10px] border px-4 py-3 transition-colors",
        done ? "border-ok-line bg-ok-bg/35 hover:bg-ok-bg" : "border-line bg-raised hover:bg-inset",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "grid h-[26px] w-[26px] place-items-center rounded-full text-[12px]",
          done ? "bg-ok-fg text-[color:var(--bg-raised)]" : "bg-inset text-subtle",
        )}
      >
        {done ? "✓" : KIND_ICON[lesson.kind]}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[15px] font-bold">{lesson.title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-muted">{lesson.summary}</span>
      </span>

      <span className="flex shrink-0 items-center gap-2.5">
        {progress?.total ? (
          <span className="text-[13px] font-semibold tabular-nums text-muted">
            {progress.score}/{progress.total}
          </span>
        ) : null}
        <span className="hidden text-[13px] text-subtle tabular-nums sm:inline">{lesson.minutes}m</span>
        <Badge tone={KIND_TONE[lesson.kind]}>{LESSON_KIND_LABEL[lesson.kind]}</Badge>
      </span>
    </Link>
  );
}
