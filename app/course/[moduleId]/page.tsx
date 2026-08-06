"use client";

import { notFound } from "next/navigation";
import { use } from "react";
import { lessonHref, moduleById, modules } from "../../content/course";
import { lessonMinutes } from "../../content/schema";
import { useCourseProgress } from "../../lib/use-progress";
import { LessonRow } from "../../components/lesson-row";
import { Badge, Card, LinkButton, Meter, Page, PageHeader, Spinner } from "../../components/ui";

export default function ModulePage({ params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = use(params);
  const courseModule = moduleById(moduleId);
  if (!courseModule) notFound();

  const { byLesson, moduleStats, loading } = useCourseProgress();
  const stats = moduleStats(courseModule.id);
  const position = modules.findIndex((item) => item.id === courseModule.id);
  const nextModule = modules[position + 1] ?? null;
  const firstUndone = courseModule.lessons.find((lesson) => !byLesson.has(lesson.id)) ?? courseModule.lessons[0];

  return (
    <Page>
      <div className="mb-4">
        <LinkButton href="/course" variant="ghost" size="sm">
          ← All modules
        </LinkButton>
      </div>

      <PageHeader
        eyebrow={`Module ${courseModule.number} · ${courseModule.eyebrow}`}
        title={courseModule.title}
        lede={courseModule.summary}
        actions={
          <LinkButton variant="primary" href={lessonHref({ courseModule, lesson: firstUndone })}>
            {stats.done === 0 ? "Start module" : stats.done === stats.total ? "Review" : "Continue"}
          </LinkButton>
        }
      />

      <div className="mb-8 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="px-5 py-4">
          <p className="eyebrow mb-2.5">By the end you can</p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {courseModule.outcomes.map((outcome) => (
              <li key={outcome} className="grid grid-cols-[18px_1fr] gap-2.5 text-[14px] leading-relaxed">
                <span aria-hidden className="mt-[3px] text-ok-fg">
                  ✓
                </span>
                <span>{outcome}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow">Module progress</p>
            <span className="text-[13px] text-muted tabular-nums">
              {stats.done}/{stats.total}
            </span>
          </div>
          <div className="mt-3">
            <Meter value={stats.done} total={stats.total} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <dt className="text-muted">Estimated time</dt>
              <dd className="m-0 mt-0.5 font-display text-[18px] font-bold tabular-nums">{lessonMinutes(courseModule)}m</dd>
            </div>
            <div>
              <dt className="text-muted">Lessons</dt>
              <dd className="m-0 mt-0.5 font-display text-[18px] font-bold tabular-nums">{courseModule.lessons.length}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {loading ? (
        <Spinner label="Loading progress…" />
      ) : (
        <ol className="grid list-none gap-2 p-0">
          {courseModule.lessons.map((lesson) => (
            <li key={lesson.id}>
              <LessonRow courseModule={courseModule} lesson={lesson} progress={byLesson.get(lesson.id)} />
            </li>
          ))}
        </ol>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-line bg-inset px-5 py-4">
        {nextModule ? (
          <>
            <div className="min-w-0">
              <p className="eyebrow mb-1">Next module</p>
              <p className="m-0 text-[15px] font-bold">
                {nextModule.number}. {nextModule.title}
              </p>
            </div>
            <LinkButton href={`/course/${nextModule.id}`}>Open</LinkButton>
          </>
        ) : (
          <>
            <p className="m-0 text-[15px]">That is the last module. Your evidence lives in the Capability Ledger.</p>
            <div className="flex gap-2">
              <Badge tone="ok">Final module</Badge>
              <LinkButton href="/ledger">Open ledger</LinkButton>
            </div>
          </>
        )}
      </div>
    </Page>
  );
}
