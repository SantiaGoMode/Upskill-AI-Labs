"use client";

import { useCallback, useMemo } from "react";
import { lessonSequence, moduleById, totalLessons } from "../content/course";
import { post, useResource } from "./client-api";

export type ProgressRow = {
  id: string;
  moduleId: string;
  lessonId: string;
  status: string;
  score: number | null;
  total: number | null;
  updatedAt: string;
};

export function useCourseProgress() {
  const { data, loading, reload } = useResource<{ progress: ProgressRow[] }>("/api/course");

  const byLesson = useMemo(() => {
    const map = new Map<string, ProgressRow>();
    for (const row of data?.progress ?? []) map.set(row.lessonId, row);
    return map;
  }, [data]);

  const complete = useCallback(
    async (moduleId: string, lessonId: string, score?: number) => {
      await post("/api/course", { action: "complete", moduleId, lessonId, score });
      await reload();
    },
    [reload],
  );

  const moduleStats = useCallback(
    (moduleId: string) => {
      const lessons = moduleById(moduleId)?.lessons ?? [];
      return { done: lessons.filter((lesson) => byLesson.has(lesson.id)).length, total: lessons.length };
    },
    [byLesson],
  );

  const overall = useMemo(
    () => ({ done: lessonSequence.filter((item) => byLesson.has(item.lesson.id)).length, total: totalLessons }),
    [byLesson],
  );

  /** First lesson the learner has not completed, in reading order. */
  const nextLesson = useMemo(() => lessonSequence.find((item) => !byLesson.has(item.lesson.id)) ?? null, [byLesson]);

  return { byLesson, loading, complete, moduleStats, overall, nextLesson };
}
