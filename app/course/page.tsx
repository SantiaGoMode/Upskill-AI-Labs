"use client";

import Link from "next/link";
import { course, lessonHref, totalMinutes } from "../content/course";
import { lessonMinutes } from "../content/schema";
import { useCourseProgress } from "../lib/use-progress";
import { Badge, Card, cx, LinkButton, Meter, Page, PageHeader, Spinner } from "../components/ui";

export default function CoursePage() {
  const { moduleStats, overall, nextLesson, loading } = useCourseProgress();

  return (
    <Page>
      <PageHeader
        eyebrow="Course"
        title={course.title}
        lede={course.subtitle}
        actions={
          nextLesson ? (
            <LinkButton variant="primary" href={lessonHref(nextLesson)}>
              {overall.done === 0 ? "Start the course" : "Continue"}
            </LinkButton>
          ) : (
            <Badge tone="ok">Course complete</Badge>
          )
        }
      />

      <Card className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4">
        <div className="min-w-[160px]">
          <p className="eyebrow">Progress</p>
          <p className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums">
            {overall.done}
            <span className="text-[16px] font-semibold text-muted">/{overall.total}</span>
          </p>
          <p className="mt-1 text-[12.5px] text-muted">lessons complete</p>
        </div>
        <div className="min-w-[200px] flex-1">
          <Meter value={overall.done} total={overall.total} />
          <p className="mt-2 text-[13px] text-muted">
            {course.modules.length} modules · about {Math.round(totalMinutes / 60)} hours including the eight labs
          </p>
        </div>
        {nextLesson ? (
          <div className="min-w-[220px]">
            <p className="eyebrow">Next up</p>
            <p className="mt-1 text-[14px] font-bold">{nextLesson.lesson.title}</p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Module {nextLesson.courseModule.number} · {nextLesson.lesson.minutes} min
            </p>
          </div>
        ) : null}
      </Card>

      {loading ? (
        <Spinner label="Loading your progress…" />
      ) : (
        <ol className="grid list-none gap-3 p-0">
          {course.modules.map((courseModule) => {
            const stats = moduleStats(courseModule.id);
            const started = stats.done > 0;
            const finished = stats.done === stats.total;
            return (
              <li key={courseModule.id}>
                <Link
                  href={`/course/${courseModule.id}`}
                  className={cx(
                    "block rounded-[12px] border px-5 py-4 transition-colors",
                    finished ? "border-ok-line bg-ok-bg/30 hover:bg-ok-bg/60" : "border-line bg-raised hover:bg-inset",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                    <div className="min-w-0 max-w-[68ch]">
                      <p className="eyebrow mb-1.5">
                        Module {courseModule.number} · {courseModule.eyebrow}
                      </p>
                      <h2 className="text-[19px] font-bold">{courseModule.title}</h2>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{courseModule.summary}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-[13px] text-muted tabular-nums">{lessonMinutes(courseModule)}m</span>
                      {finished ? (
                        <Badge tone="ok">Complete</Badge>
                      ) : started ? (
                        <Badge tone="warn">
                          {stats.done}/{stats.total}
                        </Badge>
                      ) : (
                        <Badge>{courseModule.lessons.length} lessons</Badge>
                      )}
                    </div>
                  </div>
                  {started && !finished ? (
                    <div className="mt-3">
                      <Meter value={stats.done} total={stats.total} />
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Page>
  );
}
