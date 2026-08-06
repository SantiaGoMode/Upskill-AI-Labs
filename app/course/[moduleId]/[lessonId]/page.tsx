"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useState } from "react";
import { adjacentLessons, lessonById, lessonHref, moduleById } from "../../../content/course";
import { LESSON_KIND_LABEL, type QuizQuestion } from "../../../content/schema";
import { Blocks } from "../../../content/blocks";
import { useCourseProgress } from "../../../lib/use-progress";
import { errorMessage } from "../../../lib/client-api";
import { Badge, Button, Callout, Card, cx, LinkButton, Page, Spinner } from "../../../components/ui";

export default function LessonPage({ params }: { params: Promise<{ moduleId: string; lessonId: string }> }) {
  const { moduleId, lessonId } = use(params);
  const courseModule = moduleById(moduleId);
  const lesson = lessonById(moduleId, lessonId);
  if (!courseModule || !lesson) notFound();

  const { byLesson, complete, loading } = useCourseProgress();
  const { previous, next } = adjacentLessons(moduleId, lessonId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const done = byLesson.has(lesson.id);

  async function markComplete(score?: number) {
    setBusy(true);
    setError("");
    try {
      await complete(moduleId, lessonId, score);
    } catch (cause) {
      setError(errorMessage(cause, "Could not record progress"));
    } finally {
      setBusy(false);
    }
  }

  const nextHref = next ? lessonHref(next) : `/course/${courseModule.id}`;

  return (
    <Page className="max-w-[860px]">
      <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <Link href="/course" className="hover:text-fg">
          Course
        </Link>
        <span aria-hidden>›</span>
        <Link href={`/course/${courseModule.id}`} className="hover:text-fg">
          Module {courseModule.number}
        </Link>
        <span aria-hidden>›</span>
        <span className="text-fg">{LESSON_KIND_LABEL[lesson.kind]}</span>
      </nav>

      <header className="mb-7 border-b border-line pb-6">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <Badge tone={lesson.kind === "check" ? "info" : "neutral"}>{LESSON_KIND_LABEL[lesson.kind]}</Badge>
          <span className="text-[13px] text-muted">{lesson.minutes} min</span>
          {done ? <Badge tone="ok">Complete</Badge> : null}
        </div>
        <h1 className="text-[clamp(26px,3vw,36px)] font-bold">{lesson.title}</h1>
        <p className="mt-2.5 max-w-[64ch] text-[16px] leading-relaxed text-muted">{lesson.summary}</p>
      </header>

      {error ? (
        <Callout tone="risk" className="mb-6">
          {error}
        </Callout>
      ) : null}

      {loading ? <Spinner label="Loading…" /> : null}

      {lesson.blocks ? <Blocks blocks={lesson.blocks} /> : null}

      {lesson.kind === "check" && lesson.questions ? (
        <Quiz questions={lesson.questions} onPass={(score) => void markComplete(score)} busy={busy} />
      ) : null}

      {lesson.kind !== "check" ? (
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <div className="flex gap-2">
            {previous ? (
              <LinkButton variant="ghost" href={lessonHref(previous)}>
                ← Previous
              </LinkButton>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {done ? (
              <LinkButton variant="primary" href={nextHref}>
                {next ? "Next lesson →" : "Back to module"}
              </LinkButton>
            ) : (
              <Button
                variant="primary"
                disabled={busy}
                onClick={async () => {
                  await markComplete();
                  window.location.href = nextHref;
                }}
              >
                {busy ? "Saving…" : next ? "Mark complete and continue →" : "Mark complete"}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </Page>
  );
}

function Quiz({ questions, onPass, busy }: { questions: QuizQuestion[]; onPass: (score: number) => void; busy: boolean }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const answered = questions.filter((question) => answers[question.id] !== undefined).length;
  const score = questions.filter((question) => answers[question.id] === question.answer).length;
  const allCorrect = score === questions.length;

  function submit() {
    setSubmitted(true);
    onPass(score);
  }

  return (
    <section className="mt-8 grid gap-4">
      {questions.map((question, index) => {
        const chosen = answers[question.id];
        const correct = chosen === question.answer;
        return (
          <Card key={question.id} className="px-5 py-4">
            <p className="m-0 mb-3 text-[15px] font-bold">
              <span className="mr-2 text-subtle tabular-nums">{index + 1}.</span>
              {question.prompt}
            </p>
            <div className="grid gap-1.5">
              {question.options.map((option, optionIndex) => {
                const isChosen = chosen === optionIndex;
                const isAnswer = optionIndex === question.answer;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={submitted}
                    onClick={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))}
                    className={cx(
                      "flex items-start gap-3 rounded-[9px] border px-3.5 py-2.5 text-left text-[14px] transition-colors",
                      submitted && isAnswer && "border-ok-line bg-ok-bg",
                      submitted && isChosen && !isAnswer && "border-risk-line bg-risk-bg",
                      !submitted && isChosen && "border-primary bg-inset",
                      !submitted && !isChosen && "border-line hover:bg-inset",
                      submitted && !isAnswer && !isChosen && "border-line opacity-60",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cx(
                        "mt-[2px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[11px] font-bold",
                        isChosen || (submitted && isAnswer) ? "border-current" : "border-line-strong text-transparent",
                      )}
                    >
                      {submitted && isAnswer ? "✓" : submitted && isChosen ? "✕" : isChosen ? "●" : ""}
                    </span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
            {submitted ? (
              <Callout tone={correct ? "ok" : "warn"} className="mt-3">
                {question.explanation}
              </Callout>
            ) : null}
          </Card>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-line bg-inset px-5 py-4">
        {submitted ? (
          <>
            <div>
              <p className="m-0 font-display text-[24px] font-bold tabular-nums">
                {score}
                <span className="text-[15px] font-semibold text-muted">/{questions.length}</span>
              </p>
              <p className="m-0 mt-0.5 text-[13px] text-muted">
                {allCorrect ? "All correct. Recorded against this module." : "Recorded. Retake as often as you like."}
              </p>
            </div>
            <Button
              onClick={() => {
                setAnswers({});
                setSubmitted(false);
              }}
            >
              Retake
            </Button>
          </>
        ) : (
          <>
            <p className="m-0 text-[14px] text-muted">
              {answered}/{questions.length} answered
            </p>
            <Button variant="primary" disabled={answered < questions.length || busy} onClick={submit}>
              {busy ? "Saving…" : "Submit answers"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
