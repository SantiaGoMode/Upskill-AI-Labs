"use client";

import { useState } from "react";
import { formatDateTime, useResource } from "../lib/client-api";
import { useAction } from "../lib/use-action";
import { FacilitatorGuard } from "../components/facilitator-guard";
import {
  Badge,
  Banners,
  Button,
  Callout,
  Card,
  CardHeader,
  cx,
  Page,
  PageHeader,
  Section,
  Spinner,
  TextArea,
  TextField,
} from "../components/ui";

type Version = {
  id: string;
  parentId: string | null;
  name: string;
  version: number;
  status: "draft" | "in_review" | "approved" | "published";
  changeSummary: string;
  reviewerEmail: string | null;
  content: Record<string, unknown>;
  createdAt: string;
};

type StudioState = {
  versions: Version[];
  cohorts: Array<{ id: string; name: string; status: string }>;
  workflowSummary: { confirmedLearners: number; priorities: Array<{ name: string; count: number }> };
};

const STATUS_TONE = { draft: "neutral", in_review: "warn", approved: "info", published: "ok" } as const;

const STAGES: Array<{ status: Version["status"]; label: string }> = [
  { status: "draft", label: "Draft" },
  { status: "in_review", label: "In review" },
  { status: "approved", label: "Approved" },
  { status: "published", label: "Published" },
];

export default function StudioPage() {
  return (
    <FacilitatorGuard>
      <Studio />
    </FacilitatorGuard>
  );
}

function Studio() {
  const { data, loading, error: loadError, reload } = useResource<StudioState>("/api/trainer-studio");
  const { busy, error, notice, run } = useAction("/api/trainer-studio", reload);
  const [forkName, setForkName] = useState("Program manager pathway · cohort edition");
  const [changeSummary, setChangeSummary] = useState("");
  const [cohortName, setCohortName] = useState("Program managers · pilot cohort");
  const [learnerEmails, setLearnerEmails] = useState("");
  const [invitations, setInvitations] = useState<Array<{ email: string; joinPath: string }>>([]);

  const versions = data?.versions ?? [];
  const latest = versions[0] ?? null;
  const published = versions.find((version) => version.status === "published") ?? null;
  const summary = data?.workflowSummary;

  async function act(body: unknown, success: string) {
    const result = await run<{ invitations?: Array<{ email: string; joinPath: string }> }>(body, success);
    if (result?.invitations) setInvitations(result.invitations);
  }

  // The editor starts from the stored summary and only diverges once typed into.
  const pendingSummary = changeSummary || latest?.changeSummary || "";
  const saveDraft = () =>
    act({ action: "edit", id: latest?.id, content: latest?.content, changeSummary: pendingSummary }, "Draft saved.");

  return (
    <Page>
      <PageHeader
        eyebrow="Trainer Studio"
        title="Curriculum as code"
        lede="Fork the canonical pathway, edit it, and move it through human review. Draft material can never contribute to a capability claim before it is reviewed and published."
      />

      <Banners errors={[loadError, error]} notice={notice} />

      {loading ? (
        <Spinner label="Loading studio…" />
      ) : (
        <>
          <Section title="Review gate" description="A version reaches assessment authority only by passing every stage.">
            {latest ? (
              <Card>
                <CardHeader
                  eyebrow={`Version ${latest.version}`}
                  title={latest.name}
                  meta={`Created ${formatDateTime(latest.createdAt)}${latest.reviewerEmail ? ` · approved by ${latest.reviewerEmail}` : ""}`}
                  actions={<Badge tone={STATUS_TONE[latest.status]}>{latest.status.replace("_", " ")}</Badge>}
                />
                <div className="p-5">
                  <ol className="mb-5 flex list-none flex-wrap items-center gap-2 p-0">
                    {STAGES.map((stage, index) => {
                      const done = index <= STAGES.findIndex((item) => item.status === latest.status);
                      return (
                        <li key={stage.status} className="flex items-center gap-2">
                          <span
                            className={cx(
                              "rounded-full border px-3 py-1 text-[13px] font-semibold",
                              done ? "border-primary bg-primary text-primary-fg" : "border-line text-subtle",
                            )}
                          >
                            {stage.label}
                          </span>
                          {index < STAGES.length - 1 ? <span aria-hidden className="text-subtle">→</span> : null}
                        </li>
                      );
                    })}
                  </ol>

                  {latest.status === "draft" ? (
                    <>
                      <TextArea
                        label="Change summary"
                        hint="Required before review"
                        rows={3}
                        value={pendingSummary}
                        onChange={(event) => setChangeSummary(event.target.value)}
                        placeholder="What changed, and why it does not weaken the assessed outcomes…"
                      />
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button disabled={busy} onClick={() => void saveDraft()}>
                          Save draft
                        </Button>
                        <Button
                          variant="primary"
                          disabled={busy || !pendingSummary.trim()}
                          onClick={async () => {
                            await saveDraft();
                            await act({ action: "submit-review", id: latest.id }, "Sent to human review.");
                          }}
                        >
                          Submit for review
                        </Button>
                      </div>
                    </>
                  ) : null}

                  {latest.status === "in_review" ? (
                    <>
                      <p className="m-0 mb-4 text-[14px] text-muted">{latest.changeSummary}</p>
                      <Button variant="primary" disabled={busy} onClick={() => void act({ action: "approve", id: latest.id }, "Approved.")}>
                        Approve assessed spine
                      </Button>
                    </>
                  ) : null}

                  {latest.status === "approved" ? (
                    <Button variant="primary" disabled={busy} onClick={() => void act({ action: "publish", id: latest.id }, "Published.")}>
                      Publish version
                    </Button>
                  ) : null}

                  {latest.status === "published" ? (
                    <Callout tone="ok" title="Published and review-gated.">
                      Ready for cohort assignment. Submissions against this version can support capability claims.
                    </Callout>
                  ) : null}
                </div>
              </Card>
            ) : (
              <Card className="border-dashed p-6 text-center">
                <p className="m-0 text-[15px] font-bold">No forks yet.</p>
                <p className="mx-auto m-0 mt-2 max-w-[52ch] text-[14px] text-muted">
                  Fork the canonical eight-lab pathway to start editing. Scratch edits never count toward capability
                  claims until they clear review.
                </p>
              </Card>
            )}

            <Card className="mt-4 p-5">
              <TextField
                label="New fork name"
                value={forkName}
                onChange={(event) => setForkName(event.target.value)}
                className="mb-4"
              />
              <Button
                variant={latest ? "secondary" : "primary"}
                disabled={busy || !forkName.trim()}
                onClick={() => void act({ action: "fork", parentId: latest?.id, name: forkName }, "Draft fork created.")}
              >
                {latest ? "Fork current version" : "Fork canonical curriculum"}
              </Button>
            </Card>

            {versions.length > 1 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="eyebrow">History</span>
                {versions.slice(0, 8).map((version) => (
                  <Badge key={version.id} tone={STATUS_TONE[version.status]}>
                    v{version.version} · {version.status.replace("_", " ")}
                  </Badge>
                ))}
                {versions.length > 8 ? (
                  <span className="text-[13px] text-muted">+{versions.length - 8} older</span>
                ) : null}
              </div>
            ) : null}
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Cohort composer" description="See the aggregate workflow map before the cohort starts.">
              <Card className="p-5">
                <p className="font-display text-[32px] font-bold leading-none tabular-nums">
                  {summary?.confirmedLearners ?? 0}
                </p>
                <p className="mt-1.5 text-[13px] text-muted">confirmed workflow maps across all learners</p>

                {summary?.priorities.length ? (
                  <ul className="mt-4 grid list-none gap-0 p-0">
                    {summary.priorities.slice(0, 5).map((item) => (
                      <li key={item.name} className="flex items-center justify-between gap-4 border-t border-line py-2 text-[13px]">
                        <span className="min-w-0 truncate">{item.name}</span>
                        <span className="font-bold tabular-nums">{item.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-[13px] text-muted">
                    No learner has confirmed a workflow map yet. Aggregate priorities appear here as they do.
                  </p>
                )}
              </Card>
            </Section>

            <Section title="Create a cohort" description="Only a published version can carry a cohort.">
              <Card className="p-5">
                {!published ? (
                  <Callout tone="warn">Publish a reviewed curriculum version before composing a cohort.</Callout>
                ) : (
                  <>
                    <TextField
                      label="Cohort name"
                      value={cohortName}
                      onChange={(event) => setCohortName(event.target.value)}
                      className="mb-4"
                    />
                    <TextArea
                      label="Learner emails"
                      hint="Comma or newline separated"
                      rows={3}
                      value={learnerEmails}
                      onChange={(event) => setLearnerEmails(event.target.value)}
                      placeholder="one@example.com, two@example.com"
                      className="mb-4"
                    />
                    <Button
                      variant="primary"
                      className="w-full"
                      disabled={busy || !cohortName.trim()}
                      onClick={() =>
                        void act(
                          {
                            action: "create-cohort",
                            name: cohortName,
                            curriculumVersionId: published.id,
                            learnerEmails: learnerEmails.split(/[\s,]+/).filter(Boolean),
                          },
                          "Cohort created.",
                        )
                      }
                    >
                      Create cohort from v{published.version}
                    </Button>
                  </>
                )}

                {invitations.length ? (
                  <div className="mt-4 rounded-[10px] border border-line bg-inset p-4">
                    <p className="eyebrow mb-2">Invitation links</p>
                    <ul className="grid list-none gap-1.5 p-0">
                      {invitations.map((invitation) => (
                        <li key={invitation.email} className="text-[12px]">
                          <span className="font-semibold">{invitation.email}</span>
                          <code className="mt-0.5 block break-all font-mono text-ok-fg">{invitation.joinPath}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Card>
            </Section>
          </div>
        </>
      )}
    </Page>
  );
}
