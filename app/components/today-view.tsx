"use client";

import Link from "next/link";
import { useMemo } from "react";
import { labs, labShortTitle } from "../lib/labs";
import type { PersistedAttempt } from "../lib/attempt-types";
import { formatDateTime, useIdentity, useResource } from "../lib/client-api";
import { useCourseProgress } from "../lib/use-progress";
import { course, lessonHref, type LessonRef } from "../content/course";
import { Badge, BandBadge, Callout, Card, cx, LinkButton, Meter, Page, PageHeader, Section, Spinner, Stat } from "./ui";

type Claim = { id: string; label: string; band: string; effectiveStatus: string; expiresAt: string; evidence: unknown[] };
type CohortSession = { id: string; title: string; scheduledAt: string; status: string };
type LearnerCohort = { id: string; name: string; status: string; sessions: CohortSession[] };

export function TodayView() {
  const { identity } = useIdentity();
  const attempts = useResource<{ attempts: PersistedAttempt[] }>("/api/attempts?history=1");
  const capabilities = useResource<{ claims: Claim[] }>("/api/capabilities");
  const cohorts = useResource<{ cohorts: LearnerCohort[] }>("/api/cohorts");
  const progress = useCourseProgress();

  const byLab = useMemo(() => {
    const map = new Map<string, PersistedAttempt>();
    for (const attempt of attempts.data?.attempts ?? []) {
      // History arrives newest-first, so the first hit per lab is the current one.
      if (!map.has(attempt.labId)) map.set(attempt.labId, attempt);
    }
    return map;
  }, [attempts.data]);

  const submittedCount = labs.filter((lab) => byLab.get(lab.id)?.status === "submitted").length;
  const claims = capabilities.data?.claims ?? [];
  const activeClaims = claims.filter((claim) => claim.effectiveStatus === "active");

  const upcoming = (cohorts.data?.cohorts ?? [])
    .flatMap((cohort) => cohort.sessions.map((session) => ({ ...session, cohortId: cohort.id, cohortName: cohort.name })))
    .filter((session) => session.status !== "completed")
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .slice(0, 3);

  const started = progress.overall.done > 0;
  const greetingName = greetableName(identity?.displayName);
  const next = nextUp(progress.nextLesson, byLab);

  return (
    <Page>
      <PageHeader
        eyebrow="Program manager pathway"
        title={greetingName ? `Welcome back, ${greetingName}.` : "Welcome back."}
        lede="Eight labs inside Northwind, a synthetic enterprise with deliberately imperfect records. You leave with evidence-linked artifacts, not a completion certificate."
      />

      <Section>
        <Card className="overflow-hidden">
          <div className="grid gap-0 md:grid-cols-[1.4fr_1fr]">
            <div className="bg-forest px-6 py-7 text-white">
              <p className="eyebrow !text-[color:var(--brand-mint)]">
                {started ? "Continue where you left off" : "Start here"}
              </p>
              <h2 className="mt-2.5 text-[28px] font-bold">{next.title}</h2>
              <p className="mt-2.5 max-w-[52ch] text-[14px] leading-relaxed text-[color:var(--fg-on-dark-muted)]">
                {next.summary}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <LinkButton variant="accent" className="!min-h-[42px]" href={next.href}>
                  {started ? "Continue" : "Begin the course"}
                </LinkButton>
                <span className="font-mono text-[13px] text-[color:var(--brand-mint)]">{next.tag}</span>
              </div>
            </div>
            <div className="px-6 py-7">
              <p className="eyebrow">Course progress</p>
              <p className="mt-2 font-display text-[38px] font-bold leading-none tabular-nums">
                {progress.overall.done}
                <span className="text-[18px] font-semibold text-muted">/{progress.overall.total}</span>
              </p>
              <p className="mt-1.5 text-[13px] text-muted">
                lessons complete across {course.modules.length} modules
              </p>
              <div className="mt-4">
                <Meter value={progress.overall.done} total={progress.overall.total} />
              </div>
              <p className="mt-3 text-[13px] text-muted">
                <span className="font-bold text-fg">{submittedCount}</span> of {labs.length} labs submitted
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-[13px]">
                <div>
                  <dt className="text-muted">Active claims</dt>
                  <dd className="m-0 mt-1 font-display text-[20px] font-bold tabular-nums">{activeClaims.length}</dd>
                </div>
                <div>
                  <dt className="text-muted">Attempts on record</dt>
                  <dd className="m-0 mt-1 font-display text-[20px] font-bold tabular-nums">
                    {attempts.data?.attempts.length ?? 0}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </Card>
      </Section>

      <Section
        title="The eight labs"
        description="The assessed practice inside the course. Each lab sits at the end of its module."
        actions={
          <LinkButton variant="ghost" size="sm" href="/course">
            Open the course
          </LinkButton>
        }
      >
        {attempts.loading ? (
          <Spinner label="Loading your record…" />
        ) : (
          <ol className="grid list-none gap-2 p-0">
            {labs.map((lab) => {
              const status = byLab.get(lab.id)?.status;
              return (
                <li key={lab.id}>
                  <Link
                    href={`/lab/${lab.id}`}
                    className={cx(
                      "grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-4 rounded-[10px] border px-4 py-3.5 transition-colors",
                      status === "submitted"
                        ? "border-ok-line bg-ok-bg/40 hover:bg-ok-bg"
                        : status === "in_progress"
                          ? "border-line-strong bg-raised hover:bg-inset"
                          : "border-line bg-raised hover:bg-inset",
                    )}
                  >
                    <span className="font-mono text-[13px] text-subtle">{String(lab.number).padStart(2, "0")}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-bold">{labShortTitle(lab)}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">{lab.summary}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="hidden font-mono text-[11px] text-subtle sm:inline">{lab.play}</span>
                      {status === "submitted" ? (
                        <Badge tone="ok">Submitted</Badge>
                      ) : status === "in_progress" ? (
                        <Badge tone="warn">In progress</Badge>
                      ) : (
                        <Badge>Not started</Badge>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Capability claims" description="Evidence-linked, banded, and expiring after 180 days.">
          {capabilities.loading ? (
            <Spinner label="Loading claims…" />
          ) : claims.length === 0 ? (
            <Callout tone="info">
              Submit an assessed lab, then refresh claims in the{" "}
              <Link href="/ledger" className="font-semibold underline">
                Capability Ledger
              </Link>
              .
            </Callout>
          ) : (
            <ul className="grid list-none gap-2 p-0">
              {claims.slice(0, 5).map((claim) => (
                <Card as="li" key={claim.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[14px] font-bold capitalize">{claim.label}</p>
                    <p className="m-0 mt-0.5 text-[12px] text-muted">
                      {claim.evidence.length} evidence link{claim.evidence.length === 1 ? "" : "s"} ·{" "}
                      {claim.effectiveStatus === "expired" ? "expired" : `expires ${new Date(claim.expiresAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <BandBadge band={claim.band} />
                </Card>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Scheduled sessions" description="Live rooms your cohort has on the calendar.">
          {cohorts.loading ? (
            <Spinner label="Loading sessions…" />
          ) : upcoming.length === 0 ? (
            <Callout tone="info">No sessions scheduled. Labs run fine solo and asynchronously.</Callout>
          ) : (
            <ul className="grid list-none gap-2 p-0">
              {upcoming.map((session) => (
                <Card as="li" key={session.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[14px] font-bold">{session.title}</p>
                    <p className="m-0 mt-0.5 text-[12px] text-muted">
                      {session.cohortName} · {formatDateTime(session.scheduledAt)}
                    </p>
                  </div>
                  <LinkButton size="sm" variant={session.status === "live" ? "primary" : "secondary"} href={`/room/${session.id}`}>
                    {session.status === "live" ? "Join" : "Open"}
                  </LinkButton>
                </Card>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section>
        <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="min-w-0 max-w-[64ch]">
            <p className="eyebrow mb-1.5">Bring your own job</p>
            <h2 className="text-[19px] font-bold">Make the scenarios match your actual work.</h2>
            <p className="mt-1.5 text-[14px] text-muted">
              Describe your role, or let the browser reduce a real artifact to a structural profile before anything is
              sent. The assessed spine never changes — only the skin around it.
            </p>
          </div>
          <LinkButton variant="primary" href="/onboarding">
            Map my workflows
          </LinkButton>
        </Card>
      </Section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Synthetic enterprise" value="Northwind" hint="One persistent universe across all eight labs" />
        <Stat label="Model providers" value="4" hint="Gemini, OpenAI, Anthropic, local Ollama" />
        <Stat label="Rubric dimensions" value="5" hint="Grounding, completeness, judgment, efficiency, guardrails" />
      </div>
    </Page>
  );
}

/**
 * Local dev identities are named things like "Local learner", so only greet by
 * first name when the display name actually looks like a person's name.
 */
function greetableName(displayName: string | undefined) {
  const [first, ...rest] = displayName?.trim().split(/\s+/) ?? [];
  const usable = rest.length > 0 && /^[A-Z]/.test(first ?? "") && !/^(local|test|demo)$/i.test(first ?? "");
  return usable ? first : (displayName ?? "");
}

/**
 * The hero card follows course reading order. Once every lesson is complete it
 * falls back to the labs themselves, preferring one already in progress.
 */
function nextUp(lesson: LessonRef | null, byLab: Map<string, PersistedAttempt>) {
  if (lesson) {
    return {
      title: `Module ${lesson.courseModule.number} · ${lesson.lesson.title}`,
      summary: lesson.lesson.summary,
      href: lessonHref(lesson),
      tag: lesson.courseModule.eyebrow,
    };
  }

  const lab =
    labs.find((item) => byLab.get(item.id)?.status === "in_progress") ??
    labs.find((item) => !byLab.has(item.id)) ??
    labs[labs.length - 1];
  return { title: `Lab ${lab.number} · ${lab.title}`, summary: lab.summary, href: `/lab/${lab.id}`, tag: lab.play };
}
