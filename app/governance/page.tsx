"use client";

import { useState } from "react";
import { errorMessage, formatDateTime, post, useResource } from "../lib/client-api";
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
  SelectField,
  Spinner,
  TextField,
} from "../components/ui";

type Policy = {
  id: string;
  name: string;
  version: number;
  status: string;
  allowedIntakeTier: string;
  dataClasses: string[];
  approvedModels: string[];
  prohibitedUses: string[];
  disclosureRules: string[];
  humanReviewRules: string[];
  promptRetentionDays: number;
};

type AuditEvent = {
  id: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
};

type RetentionState = { retentionDays: number; expiring: number };

type GovernanceState = { policy: Policy; profiles: Policy[]; audit: AuditEvent[]; retention?: RetentionState };

const DATA_CLASSES = ["Public", "Internal", "Confidential", "Regulated"];
const PROVIDERS = ["gemini", "openai", "anthropic", "ollama"];

export default function GovernancePage() {
  return (
    <FacilitatorGuard>
      <Governance />
    </FacilitatorGuard>
  );
}

function Governance() {
  const { data, loading, error: loadError, reload } = useResource<GovernanceState>("/api/governance");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const policy = data?.policy;

  // Both panels report through the same pair: success clears the error, and vice versa.
  const report = {
    onDone: async (message: string) => {
      setNotice(message);
      setError("");
      await reload();
    },
    onError: (message: string) => {
      setError(message);
      setNotice("");
    },
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Governance plane"
        title="Policy, data classes, and audit"
        lede="Write the policy once and it drives what the sandbox permits, which guardrail modules are mandatory, and the compliance evidence a sponsor can export. Policies are versioned, never edited in place."
      />

      <Banners errors={[loadError, error]} notice={notice} />

      {loading || !policy ? (
        <Spinner label="Loading policy…" />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Active policy">
              <PolicyEditor key={policy.id} policy={policy} onSaved={report.onDone} onError={report.onError} />
            </Section>

            <Section title="Boundaries learners can see" description="Surfaced contextually inside labs, not buried in a handbook.">
              <Card className="p-5">
                <RuleList title="Prohibited uses" rules={policy.prohibitedUses} />
                <RuleList title="Disclosure" rules={policy.disclosureRules} />
                <RuleList title="Human review" rules={policy.humanReviewRules} />
              </Card>

              {data?.profiles?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {data.profiles.map((profile) => (
                    <Badge key={profile.id} tone={profile.status === "active" ? "ok" : "neutral"}>
                      v{profile.version} · {profile.status}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </Section>
          </div>

          <Section
            title="Prompt retention"
            description="Prompt and model-response records are deleted past the retention window by a nightly job. Submitted artifacts, evaluations, and capability claims are assessment evidence and are not covered."
          >
            <RetentionPanel retention={data?.retention} onDone={report.onDone} onError={report.onError} />
          </Section>

          <Section title="Audit trail" description="Actor-linked events for policy changes, curriculum gates, cohorts, baselines, and measurements.">
            {!data?.audit?.length ? (
              <Callout tone="info">No audit events recorded yet.</Callout>
            ) : (
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className="px-4 py-2.5 font-semibold">When</th>
                      <th className="px-4 py-2.5 font-semibold">Actor</th>
                      <th className="px-4 py-2.5 font-semibold">Action</th>
                      <th className="px-4 py-2.5 font-semibold">Entity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit.slice(0, 40).map((event) => (
                      <tr key={event.id} className="border-b border-line last:border-b-0">
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatDateTime(event.createdAt)}</td>
                        <td className="px-4 py-2.5">{event.actorEmail}</td>
                        <td className="px-4 py-2.5 font-mono text-[12px]">{event.action}</td>
                        <td className="px-4 py-2.5 text-muted">{event.entityType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </Section>
        </>
      )}
    </Page>
  );
}

/**
 * Keyed by policy id so the loaded policy seeds the form on mount rather than
 * being copied in with an effect.
 */
function PolicyEditor({
  policy,
  onSaved,
  onError,
}: {
  policy: Policy;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(policy.name);
  const [tier, setTier] = useState(policy.allowedIntakeTier);
  const [dataClasses, setDataClasses] = useState<string[]>(policy.dataClasses);
  const [approvedModels, setApprovedModels] = useState<string[]>(policy.approvedModels);
  const [retention, setRetention] = useState(policy.promptRetentionDays);
  const [busy, setBusy] = useState(false);

  function toggle(value: string, list: string[], set: (next: string[]) => void) {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function save(action: "save" | "activate") {
    setBusy(true);
    try {
      await post("/api/governance", {
        action,
        name,
        allowedIntakeTier: tier,
        dataClasses,
        approvedModels,
        promptRetentionDays: retention,
        prohibitedUses: policy.prohibitedUses,
        disclosureRules: policy.disclosureRules,
        humanReviewRules: policy.humanReviewRules,
      });
      await onSaved(action === "activate" ? "Policy activated as a new version." : "Draft policy saved.");
    } catch (cause) {
      onError(errorMessage(cause, "Unable to save the policy"));
    } finally {
      setBusy(false);
    }
  }

  const dirty =
    name !== policy.name ||
    tier !== policy.allowedIntakeTier ||
    retention !== policy.promptRetentionDays ||
    dataClasses.join() !== policy.dataClasses.join() ||
    approvedModels.join() !== policy.approvedModels.join();

  return (
    <Card>
      <CardHeader eyebrow={`Version ${policy.version}`} title={policy.name} actions={<Badge tone="ok">{policy.status}</Badge>} />
      <div className="p-5">
        <TextField label="Policy name" value={name} onChange={(event) => setName(event.target.value)} className="mb-4" />

        <SelectField
          label="Maximum BYOJ intake tier"
          value={tier}
          onChange={(event) => setTier(event.target.value)}
          className="mb-4"
        >
          <option value="T0">T0 · describe only</option>
          <option value="T1">T1 · redacted structure</option>
          <option value="T2">T2 · full artifact</option>
        </SelectField>

        <fieldset className="mb-4 border-0 p-0">
          <legend className="mb-2 text-[13px] font-semibold">Data classes permitted in a prompt</legend>
          <div className="flex flex-wrap gap-2">
            {DATA_CLASSES.map((item) => (
              <ToggleChip key={item} label={item} active={dataClasses.includes(item)} onClick={() => toggle(item, dataClasses, setDataClasses)} />
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-4 border-0 p-0">
          <legend className="mb-2 text-[13px] font-semibold">Approved providers</legend>
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((item) => (
              <ToggleChip key={item} label={item} active={approvedModels.includes(item)} onClick={() => toggle(item, approvedModels, setApprovedModels)} />
            ))}
          </div>
        </fieldset>

        <TextField
          label="Prompt retention (days)"
          type="number"
          min={0}
          max={365}
          value={retention}
          onChange={(event) => setRetention(Number(event.target.value))}
          className="mb-4"
        />

        {dirty ? (
          <Callout tone="warn" className="mb-4">
            Unsaved changes. Activating creates version {policy.version + 1}.
          </Callout>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void save("save")}>
            Save as draft
          </Button>
          <Button variant="primary" disabled={busy || !dataClasses.length || !approvedModels.length} onClick={() => void save("activate")}>
            Activate new version
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Runs the purge the nightly cron would run, and reports what is currently expiring. */
function RetentionPanel({
  retention,
  onDone,
  onError,
}: {
  retention?: RetentionState;
  onDone: (message: string) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const purge = async () => {
    setBusy(true);
    try {
      const result = await post<{ deleted: Record<string, number> }>("/api/governance", { action: "purge-retention" });
      const total = Object.values(result.deleted).reduce((sum, count) => sum + count, 0);
      await onDone(total ? `Purge removed ${total} expired record${total === 1 ? "" : "s"}.` : "Nothing was past the retention window.");
    } catch (cause) {
      onError(errorMessage(cause, "Retention purge failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      {retention?.retentionDays === 0 ? (
        <Callout tone="warn">
          The retention window is set to zero, which disables time-based deletion of prompt records.
        </Callout>
      ) : (
        <p className="m-0 text-[15px]">
          Records older than <strong>{retention?.retentionDays ?? 90} days</strong> are removed nightly at 03:00 UTC.
          {" "}
          {retention?.expiring
            ? `${retention.expiring} model run${retention.expiring === 1 ? " is" : "s are"} currently past the window.`
            : "Nothing is currently past the window."}
        </p>
      )}
      <Button className="mt-4" disabled={busy} onClick={() => void purge()}>
        {busy ? "Purging…" : "Run the purge now"}
      </Button>
    </Card>
  );
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "rounded-full border px-3 py-1.5 text-[13px] font-semibold capitalize transition-colors",
        active ? "border-primary bg-primary text-primary-fg" : "border-line text-muted hover:bg-inset",
      )}
    >
      {label}
    </button>
  );
}

function RuleList({ title, rules }: { title: string; rules: string[] }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="eyebrow mb-2">{title}</p>
      <ul className="m-0 grid list-none gap-0 p-0">
        {rules.map((rule) => (
          <li key={rule} className="border-t border-line py-2 text-[13px] leading-relaxed first:border-t-0">
            {rule}
          </li>
        ))}
      </ul>
    </div>
  );
}
