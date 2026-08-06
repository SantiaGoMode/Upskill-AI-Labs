import type { Course, Lesson, Module } from "./schema";
import { module0 } from "./module-0";
import { module1, module2, module3, module4 } from "./modules-1-4";
import { module5, module6, module7, module8 } from "./modules-5-8";

export const course: Course = {
  id: "pm-ai-first",
  title: "AI-first program management",
  subtitle:
    "Nine modules. You learn what the tools actually do, then rebuild eight real deliverables around them inside a synthetic enterprise.",
  modules: [module0, module1, module2, module3, module4, module5, module6, module7, module8],
};

export const modules = course.modules;

export const moduleById = (moduleId: string) => modules.find((courseModule) => courseModule.id === moduleId);

export function lessonById(moduleId: string, lessonId: string) {
  return moduleById(moduleId)?.lessons.find((lesson) => lesson.id === lessonId);
}

/** Lab lessons hand off to the lab runner; every other kind renders in the course reader. */
export function lessonHref({ courseModule, lesson }: { courseModule: Module; lesson: Lesson }) {
  return lesson.kind === "lab" && lesson.labId ? `/lab/${lesson.labId}` : `/course/${courseModule.id}/${lesson.id}`;
}

/** Flat reading order across the whole course, used for prev/next navigation. */
export type LessonRef = { courseModule: Module; lesson: Lesson; index: number };

export const lessonSequence: LessonRef[] = modules.flatMap((courseModule) =>
  courseModule.lessons.map((lesson, index) => ({ courseModule, lesson, index })),
);

export function adjacentLessons(moduleId: string, lessonId: string) {
  const position = lessonSequence.findIndex((item) => item.courseModule.id === moduleId && item.lesson.id === lessonId);
  return {
    previous: position > 0 ? lessonSequence[position - 1] : null,
    next: position >= 0 && position < lessonSequence.length - 1 ? lessonSequence[position + 1] : null,
  };
}

/** The lesson that owns a given lab, so the lab runner can link back into the course. */
export function moduleForLab(labId: string) {
  for (const courseModule of modules) {
    const lesson = courseModule.lessons.find((item) => item.labId === labId);
    if (lesson) return { courseModule, lesson };
  }
  return null;
}

export const totalLessons = lessonSequence.length;
export const totalMinutes = lessonSequence.reduce((sum, item) => sum + item.lesson.minutes, 0);
