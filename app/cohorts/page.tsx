"use client";

import { useState } from "react";
import { formatDateTime, useResource } from "../lib/client-api";
import { useAction } from "../lib/use-action";
import { MeetControls } from "../components/meet-controls";
import { FacilitatorGuard } from "../components/facilitator-guard";
import {
  Badge,
  Banners,
  Button,
  Callout,
  Card,
  EmptyState,
  LinkButton,
  Meter,
  Page,
  PageHeader,
  Section,
  SelectField,
  Spinner,
  Stat,
  TextArea,
  TextField,
} from "../components/ui";

type Intervention = { id: string; note: string; status: string; createdAt: string };

type Learner = {
  id: string;
  learnerEmail: string;
  status: string;
  completedLabs: string[];
  passedLabs: string[];
  completionPercent: number;
  lastActivity: string | null;
  interventions: Intervention[];
};

type Session = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  agenda: string;
  meetingUri: string | null;
  meetingSpace: string | null;
  meetingSource: string | null;
};

type Cohort = {
  id: string;
  name: string;
  status: string;
  startsAt: string | null;
  curriculum: { name: string; version: number } | null;
  learners: Learner[];
  sessions: Session[];
  outcome: { invited: number; enrolled: number; completed: number; passedLabs: number; totalSubmissions: number };
};

type CohortsState = { organization: { id: string; name: string }; cohorts: Cohort[] };

const STATUS_TONE: Record<string, "neutral" | "ok" | "warn" | "info"> = {
  draft: "neutral",
  ready: "info",
  active: "ok",
  completed: "neutral",
  archived: "neutral",
};

export default function CohortsPage() {
  return (
    <FacilitatorGuard>
      <Cohorts />
    </FacilitatorGuard>
  );
}

function Cohorts() {
  const { data, loading, error: loadError, reload } = useResource<CohortsState>("/api/cohorts");
  const { busy, error, notice, run } = useAction("/api/cohorts", reload);
  const [selectedId, setSelectedId] = useState("");

  const cohorts = data?.cohorts ?? [];
  const selected = cohorts.find((cohort) => cohort.id === selectedId) ?? cohorts[0] ?? null;

  /** Every cohort action targets the selected cohort, so the id is attached here once. */
  async function act(body: Record<string, unknown>, success: string) {
    if (!selected) return;
    await run({ cohortId: selected.id, ...body }, success);
  }

  return (
    <Page>
      <PageHeader
        eyebrow={data?.organization ? data.organization.name : "Cohorts"}
        title="Cohort operations"
        lede="Roster, progress, scheduled sessions, and the interventions you have logged. Learner email addresses stay with you — participants never see each other's."
        actions={<LinkButton href="/studio" variant="secondary">Create a cohort</LinkButton>}
      />

      <Banners errors={[loadError, error]} notice={notice} />

      {loading ? (
        <Spinner label="Loading cohorts…" />
      ) : !selected ? (
        <EmptyState title="No cohorts yet" action={<LinkButton href="/studio" variant="primary">Open Trainer Studio</LinkButton>}>
          A cohort needs a published curriculum version. Fork, review, and publish one in Studio first.
        </EmptyState>
      ) : (
        <>
          {cohorts.length > 1 ? (
            <SelectField
              label="Cohort"
              value={selected.id}
              onChange={(event) => setSelectedId(event.target.value)}
              className="mb-6 max-w-[420px]"
            >
              {cohorts.map((cohort) => (
                <option key={cohort.id} value={cohort.id}>
                  {cohort.name} · {cohort.status}
                </option>
              ))}
            </SelectField>
          ) : null}

          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-bold">{selected.name}</h2>
              <p className="mt-1 text-[13px] text-muted">
                {selected.curriculum ? `${selected.curriculum.name} · v${selected.curriculum.version}` : "No curriculum"}
                {selected.startsAt ? ` · started ${formatDateTime(selected.startsAt)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[selected.status] ?? "neutral"}>{selected.status}</Badge>
              {(["ready", "active", "completed", "archived"] as const)
                .filter((status) => status !== selected.status)
                .map((status) => (
                  <Button key={status} size="sm" disabled={busy} onClick={() => void act({ action: "update-status", status }, `Cohort marked ${status}.`)}>
                    Mark {status}
                  </Button>
                ))}
            </div>
          </div>

          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Invited" value={selected.outcome.invited} />
            <Stat label="Enrolled" value={selected.outcome.enrolled} />
            <Stat label="Finished all 8" value={selected.outcome.completed} />
            <Stat label="Labs passed" value={selected.outcome.passedLabs} hint={`${selected.outcome.totalSubmissions} submissions`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Section title="Roster" description="Progress is derived from real submissions, not attendance.">
              {selected.learners.length === 0 ? (
                <Callout tone="info">No learners enrolled. Invite them below.</Callout>
              ) : (
                <ul className="grid list-none gap-2 p-0">
                  {selected.learners.map((learner) => (
                    <LearnerRow key={learner.id} learner={learner} busy={busy} onAct={act} />
                  ))}
                </ul>
              )}

              <InviteForm busy={busy} onAct={act} />
            </Section>

            <Section title="Sessions" description="Each scheduled session gets a facilitated Live Room.">
              {selected.sessions.length === 0 ? (
                <Callout tone="info">Nothing scheduled yet.</Callout>
              ) : (
                <ul className="mb-4 grid list-none gap-2 p-0">
                  {selected.sessions.map((session) => (
                    <Card as="li" key={session.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="m-0 text-[14px] font-bold">{session.title}</p>
                        <p className="m-0 mt-0.5 text-[12px] text-muted">
                          {formatDateTime(session.scheduledAt)} · {session.durationMinutes} min
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={session.status === "live" ? "ok" : session.status === "completed" ? "neutral" : "info"}>
                          {session.status}
                        </Badge>
                        <LinkButton size="sm" variant="primary" href={`/room/${session.id}`}>
                          Live Room
                        </LinkButton>
                      </div>
                      <MeetControls session={session} onChanged={reload} />
                    </Card>
                  ))}
                </ul>
              )}

              <ScheduleForm busy={busy} onAct={act} />
            </Section>
          </div>
        </>
      )}
    </Page>
  );
}

function LearnerRow({
  learner,
  busy,
  onAct,
}: {
  learner: Learner;
  busy: boolean;
  onAct: (body: Record<string, unknown>, success: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const openInterventions = learner.interventions.filter((item) => item.status === "open");

  return (
    <Card as="li" className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[14px] font-semibold">{learner.learnerEmail}</p>
          <p className="m-0 mt-0.5 text-[12px] text-muted">
            {learner.completedLabs.length}/8 submitted · {learner.passedLabs.length} passed ·{" "}
            {learner.lastActivity ? `active ${formatDateTime(learner.lastActivity)}` : "no activity"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {openInterventions.length ? <Badge tone="warn">{openInterventions.length} open</Badge> : null}
          <Badge tone={learner.status === "invited" ? "neutral" : "ok"}>{learner.status}</Badge>
          <Button size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
            Note
          </Button>
        </div>
      </div>

      <div className="mt-2.5">
        <Meter value={learner.completedLabs.length} total={8} />
      </div>

      {openInterventions.length ? (
        <ul className="mt-2.5 grid list-none gap-1.5 p-0">
          {openInterventions.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 rounded-[8px] bg-warn-bg px-3 py-2 text-[12px] text-warn-fg">
              <span className="min-w-0">{item.note}</span>
              <button
                type="button"
                className="shrink-0 font-semibold underline"
                disabled={busy}
                onClick={() => void onAct({ action: "resolve-intervention", interventionId: item.id }, "Intervention resolved.")}
              >
                Resolve
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="mt-3 border-t border-line pt-3">
          <TextArea
            label="Intervention note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What is this learner stuck on, and what did you do about it?"
          />
          <Button
            size="sm"
            variant="primary"
            className="mt-2"
            disabled={busy || note.trim().length < 5}
            onClick={() =>
              void onAct({ action: "add-intervention", learnerEmail: learner.learnerEmail, note }, "Intervention logged.").then(() => {
                setNote("");
                setOpen(false);
              })
            }
          >
            Log intervention
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function InviteForm({ busy, onAct }: { busy: boolean; onAct: (body: Record<string, unknown>, success: string) => Promise<void> }) {
  const [emails, setEmails] = useState("");
  return (
    <Card className="mt-4 p-4">
      <TextArea
        label="Invite learners"
        hint="Comma or newline separated"
        rows={2}
        value={emails}
        onChange={(event) => setEmails(event.target.value)}
        placeholder="new@example.com"
      />
      <Button
        size="sm"
        className="mt-3"
        disabled={busy || !emails.trim()}
        onClick={() => void onAct({ action: "invite", emails: emails.split(/[\s,]+/).filter(Boolean) }, "Invitations created.").then(() => setEmails(""))}
      >
        Send invitations
      </Button>
    </Card>
  );
}

function ScheduleForm({ busy, onAct }: { busy: boolean; onAct: (body: Record<string, unknown>, success: string) => Promise<void> }) {
  const [title, setTitle] = useState("Evidence workshop");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [agenda, setAgenda] = useState("");

  return (
    <Card className="p-4">
      <p className="eyebrow mb-3">Schedule a session</p>
      <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} className="mb-3" />
      <div className="mb-3 grid grid-cols-2 gap-3">
        <TextField
          label="Date and time"
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
        />
        <TextField
          label="Minutes"
          type="number"
          min={15}
          max={480}
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(Number(event.target.value))}
        />
      </div>
      <TextArea label="Agenda" rows={2} value={agenda} onChange={(event) => setAgenda(event.target.value)} className="mb-3" />
      <Button
        size="sm"
        variant="primary"
        disabled={busy || !title.trim() || !scheduledAt}
        onClick={() =>
          void onAct(
            { action: "schedule-session", title, scheduledAt: new Date(scheduledAt).toISOString(), durationMinutes, agenda },
            "Session scheduled.",
          )
        }
      >
        Schedule
      </Button>
    </Card>
  );
}
