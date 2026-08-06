"use client";

import { useState } from "react";
import { errorMessage, post, useResource } from "../lib/client-api";
import { Badge, Button, Callout, cx } from "./ui";

type Session = {
  id: string;
  meetingUri: string | null;
  meetingSpace: string | null;
  meetingSource: string | null;
};

type Recap = {
  conferenceCount: number;
  latest: { startTime: string; endTime: string | null; participantCount: number } | null;
};

/**
 * Google Meet lifecycle for one session.
 *
 * Meet cannot be embedded in an iframe, so the room stays in this app and the
 * call opens in a tab. When OAuth credentials are configured the space is
 * created through the Meet REST API; otherwise the facilitator pastes a link.
 */
export function MeetControls({ session, onChanged }: { session: Session; onChanged: () => Promise<void> | void }) {
  const config = useResource<{ configured: boolean }>("/api/meet");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [recap, setRecap] = useState<Recap | null>(null);

  const configured = config.data?.configured ?? false;

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ recap?: Recap }>("/api/meet", { sessionId: session.id, ...body });
      if (result.recap) setRecap(result.recap);
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause, "Meet request failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cx("mt-3 w-full border-t border-line pt-3")}>
      {session.meetingUri ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="ok">Meet linked</Badge>
          <a
            href={session.meetingUri}
            target="_blank"
            rel="noreferrer noopener"
            className="min-w-0 truncate font-mono text-[12.5px] text-muted underline"
          >
            {session.meetingUri.replace("https://", "")}
          </a>
          <span className="text-[12px] text-subtle">{session.meetingSource === "api" ? "created via API" : "pasted"}</span>
          <div className="ml-auto flex gap-2">
            {session.meetingSpace ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act({ action: "recap" })}>
                {busy ? "…" : "Recap"}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act({ action: "clear-link" })}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">No meeting attached.</span>
          {configured ? (
            <Button size="sm" disabled={busy} onClick={() => void act({ action: "create-space" })}>
              {busy ? "Creating…" : "Create Meet space"}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setShowPaste((value) => !value)}>
            Paste a link
          </Button>
          {!configured && !config.loading ? (
            <span className="text-[12px] text-subtle">Meet API not configured — paste a link instead</span>
          ) : null}
        </div>
      )}

      {showPaste && !session.meetingUri ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://meet.google.com/abc-defg-hij"
            className="min-w-[240px] flex-1 rounded-[8px] border border-line bg-bg px-3 py-2 text-[13px]"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !link.trim()}
            onClick={() =>
              void act({ action: "set-link", meetingUri: link }).then(() => {
                setLink("");
                setShowPaste(false);
              })
            }
          >
            Attach
          </Button>
        </div>
      ) : null}

      {error ? (
        <Callout tone="risk" className="mt-2.5">
          {error}
        </Callout>
      ) : null}

      {recap ? (
        <Callout tone="info" title="Session recap" className="mt-2.5">
          {recap.latest
            ? `${recap.conferenceCount} conference${recap.conferenceCount === 1 ? "" : "s"} · ${recap.latest.participantCount} participants · started ${new Date(recap.latest.startTime).toLocaleString()}`
            : "No conference has taken place in this space yet."}
          <span className="mt-1.5 block text-[12px] opacity-80">
            Attendance is shown for your awareness only. Google&rsquo;s terms prohibit using Meet data for evaluation, so it
            never reaches the Capability Ledger.
          </span>
        </Callout>
      ) : null}
    </div>
  );
}
