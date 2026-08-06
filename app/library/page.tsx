"use client";

import { useState } from "react";
import { labById } from "../lib/labs";
import { formatDateTime, useResource } from "../lib/client-api";
import { Badge, Banners, Button, Card, EmptyState, LinkButton, Page, PageHeader, Spinner } from "../components/ui";

type Entry = {
  attemptId: string;
  labId: string;
  prompt: string;
  status: string;
  selectedSources: string[];
  updatedAt: string;
  modelRunCount: number;
  lastModel: string | null;
  reliability: {
    mode: string;
    provider: string;
    passed: number;
    total: number;
    criticalFailures: number;
    promotionReady: boolean;
    ranAt: string;
  } | null;
};

export default function LibraryPage() {
  const { data, loading, error } = useResource<{ entries: Entry[] }>("/api/prompts");
  const entries = data?.entries ?? [];

  return (
    <Page>
      <PageHeader
        eyebrow="Prompt library"
        title="The tools you built"
        lede="Every prompt you have written in a lab, with the reliability evidence attached. A prompt without a batch result behind it is a draft, not a workflow — so the pass rate travels with it."
      />

      <Banners errors={[error]} />

      {loading ? (
        <Spinner label="Loading your prompts…" />
      ) : entries.length === 0 ? (
        <EmptyState title="No prompts yet" action={<LinkButton href="/lab/lab-01" variant="primary">Open Lab 1</LinkButton>}>
          Write a prompt in any lab&rsquo;s AI workbench and it appears here with its sources, the models it ran against,
          and how it scored on the 20-case reliability set.
        </EmptyState>
      ) : (
        <ul className="grid list-none gap-3 p-0">
          {entries.map((entry) => (
            <PromptCard key={entry.attemptId} entry={entry} />
          ))}
        </ul>
      )}
    </Page>
  );
}

function PromptCard({ entry }: { entry: Entry }) {
  const [copied, setCopied] = useState(false);
  const lab = labById(entry.labId);
  const reliability = entry.reliability;

  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied — the prompt text is on screen to copy manually.
    }
  }

  return (
    <Card as="li" className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5">
            Lab {lab?.number ?? "?"} · {lab?.play ?? entry.labId}
          </p>
          <h2 className="text-[17px] font-bold">{lab?.title ?? entry.labId}</h2>
          <p className="mt-1 text-[13px] text-muted">
            {entry.selectedSources.length} source{entry.selectedSources.length === 1 ? "" : "s"} ·{" "}
            {entry.modelRunCount} model run{entry.modelRunCount === 1 ? "" : "s"}
            {entry.lastModel ? ` · ${entry.lastModel}` : ""} · updated {formatDateTime(entry.updatedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {reliability ? (
            <Badge tone={reliability.promotionReady ? "ok" : reliability.criticalFailures > 0 ? "risk" : "warn"}>
              {reliability.passed}/{reliability.total} {reliability.mode === "live" ? "live" : "dry"}
            </Badge>
          ) : (
            <Badge>Untested</Badge>
          )}
          <Button size="sm" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy"}
          </Button>
          <LinkButton size="sm" variant="ghost" href={`/lab/${entry.labId}`}>
            Open lab
          </LinkButton>
        </div>
      </div>

      <pre className="m-0 max-h-[220px] overflow-auto whitespace-pre-wrap bg-inset px-5 py-4 font-mono text-[13px] leading-relaxed">
        {entry.prompt}
      </pre>

      {!reliability ? (
        <p className="m-0 border-t border-line px-5 py-2.5 text-[13px] text-muted">
          Never batch-tested. Run it against the 20-case set in the lab workbench before trusting it twice.
        </p>
      ) : reliability.criticalFailures > 0 ? (
        <p className="m-0 border-t border-risk-line bg-risk-bg px-5 py-2.5 text-[13px] font-semibold text-risk-fg">
          {reliability.criticalFailures} critical failure{reliability.criticalFailures === 1 ? "" : "s"} on injection or
          restricted-data cases. Not safe to reuse as-is.
        </p>
      ) : null}
    </Card>
  );
}
