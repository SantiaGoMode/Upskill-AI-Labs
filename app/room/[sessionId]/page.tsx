"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { labs } from "../../lib/labs";
import { api, errorMessage, formatDateTime, post } from "../../lib/client-api";
import type { Identity } from "../../lib/client-api";
import { useLiveRoomChannel } from "../../lib/use-live-room-channel";
import { Badge, Button, Callout, Card, cx, LinkButton, Page, Spinner } from "../../components/ui";
import { BoardList, Whiteboard, type BoardCard, type Tool } from "../../components/whiteboard";

type Room = {
  id: string;
  status: string;
  currentLabId: string;
  currentSection: string;
  sharedPrompt: string;
  updatedAt: string;
};

type Participant = { id: string; displayName: string; role: string; status: string };

type RoomState = {
  identity: Identity;
  facilitator: boolean;
  session: { id: string; title: string; scheduledAt: string; agenda: string; cohortName?: string; meetingUri?: string | null };
  room: Room | null;
  participants: Participant[];
  cards: BoardCard[];
};

const SECTIONS = [
  "Welcome and objectives",
  "Evidence walkthrough",
  "Prompt design",
  "Run and compare",
  "Failure review",
  "Verification discipline",
  "Artifact critique",
  "Commitments",
];

const TOOLS: Array<{ id: Tool; label: string; glyph: string; hint: string }> = [
  { id: "select", label: "Select", glyph: "↖", hint: "Move objects, drag empty space to pan" },
  { id: "note", label: "Note", glyph: "▢", hint: "Sticky note" },
  { id: "prompt", label: "Prompt", glyph: "⌘", hint: "A prompt card the class can read" },
  { id: "artifact", label: "Artifact", glyph: "◈", hint: "Reference a Northwind source" },
  { id: "workflow", label: "Step", glyph: "⬚", hint: "A workflow step you can chain and run" },
  { id: "connect", label: "Connect", glyph: "→", hint: "Click a source, then a prompt or step, to feed it" },
  { id: "text", label: "Heading", glyph: "T", hint: "Large text" },
  { id: "ink", label: "Draw", glyph: "✎", hint: "Freehand ink" },
  { id: "erase", label: "Erase", glyph: "⌫", hint: "Click an object to remove it" },
];

const COLORS: Record<string, string> = {
  blue: "bg-[#cfe3e8]",
  yellow: "bg-[#f3e5a9]",
  green: "bg-[#cfe4cf]",
  pink: "bg-[#efd2d1]",
};

const PROVIDERS = ["gemini", "openai", "anthropic", "ollama"];

/** Keeps `lastSeenAt` current; the channel, not this, is what delivers changes. */
const PRESENCE_MS = 45_000;
/** Used only while the notification channel is unavailable. */
const FALLBACK_POLL_MS = 4_000;

export default function LiveRoomPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  return <LiveRoom sessionId={sessionId} />;
}

function LiveRoom({ sessionId }: { sessionId: string }) {
  const [view, setView] = useState<{ state: RoomState | null; error: string; loading: boolean }>({
    state: null,
    error: "",
    loading: true,
  });
  const [busy, setBusy] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("blue");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boardMode, setBoardMode] = useState<"canvas" | "list">("canvas");
  const [editing, setEditing] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runError, setRunError] = useState("");
  const [provider, setProvider] = useState("gemini");
  const joined = useRef(false);
  const interacting = useRef(false);
  /** Local positions applied over server state until the next refresh confirms them. */
  const [pending, setPending] = useState<Record<string, { x: number; y: number }>>({});

  const load = useCallback(async () => {
    try {
      const data = await api<RoomState>(`/api/live-room?sessionId=${encodeURIComponent(sessionId)}`);
      setView({ state: data, error: "", loading: false });
    } catch (cause) {
      setView((current) => ({ ...current, error: errorMessage(cause, "Unable to load this session"), loading: false }));
    }
  }, [sessionId]);

  /** A write returns the authoritative room, which supersedes any optimistic positions. */
  const applyState = useCallback((data: RoomState) => {
    setView({ state: data, error: "", loading: false });
    setPending({});
  }, []);

  const act = useCallback(
    async (body: Record<string, unknown>, quiet = false) => {
      if (!quiet) setBusy(true);
      try {
        applyState(await post<RoomState>("/api/live-room", { sessionId, ...body }));
      } catch (cause) {
        setView((current) => ({ ...current, error: errorMessage(cause, "Action failed") }));
      } finally {
        if (!quiet) setBusy(false);
      }
    },
    [applyState, sessionId],
  );

  const { state, error, loading } = view;

  useEffect(() => {
    void load();
  }, [load]);

  const roomOpen = state?.room?.status === "open";
  /** Set when a change arrives mid-drag, so it is applied once the drag ends. */
  const missedChange = useRef(false);

  const refresh = useCallback(() => {
    // Skip a refresh mid-drag so a remote update cannot move an object under the cursor.
    if (interacting.current) {
      missedChange.current = true;
      return;
    }
    void load();
  }, [load]);

  const { connected } = useLiveRoomChannel(sessionId, { enabled: Boolean(roomOpen), onChange: refresh });

  useEffect(() => {
    if (!roomOpen) return;
    if (!joined.current) {
      joined.current = true;
      void act({ action: "join" }, true);
    }
    // Presence only. Changes arrive over the channel, so this can be infrequent:
    // it exists to keep `lastSeenAt` fresh and to re-sync after a missed message.
    const presence = window.setInterval(() => {
      if (!interacting.current) void act({ action: "heartbeat" }, true);
    }, PRESENCE_MS);
    return () => window.clearInterval(presence);
  }, [act, roomOpen]);

  useEffect(() => {
    // Only while the channel is down: the room must not silently go stale.
    if (!roomOpen || connected) return;
    const poll = window.setInterval(refresh, FALLBACK_POLL_MS);
    return () => window.clearInterval(poll);
  }, [connected, refresh, roomOpen]);

  const setInteracting = useCallback((value: boolean) => {
    interacting.current = value;
    if (!value && missedChange.current) {
      missedChange.current = false;
      void load();
    }
  }, [load]);

  /** Executes a prompt or workflow card against the class model and attaches its output. */
  const run = useCallback(
    async (cardId: string, action: "run-card" | "run-chain") => {
      setRunningId(cardId);
      setRunError("");
      try {
        applyState(await post<RoomState>("/api/live-room", { sessionId, action, cardId, provider }));
      } catch (cause) {
        setRunError(errorMessage(cause, "Model run failed"));
      } finally {
        setRunningId(null);
      }
    },
    [applyState, provider, sessionId],
  );

  if (loading) {
    return (
      <Page>
        <Spinner label="Loading Live Room…" />
      </Page>
    );
  }

  if (error && !state) {
    return (
      <Page>
        <Callout tone="risk" title="Live Room unavailable">
          <p className="m-0 mt-1">{error}</p>
          <LinkButton href="/cohorts" size="sm" className="mt-3">
            Back to cohorts
          </LinkButton>
        </Callout>
      </Page>
    );
  }

  if (!state) return null;

  const { room, facilitator, session, participants, cards } = state;
  const currentLab = labs.find((lab) => lab.id === room?.currentLabId);
  const selected = cards.find((card) => card.id === selectedId) ?? null;
  const positioned = cards.map((card) => ({ ...card, ...(pending[card.id] ?? {}) }));
  // A failed model run is the more specific complaint, so it wins the banner.
  const banner = runError || error;
  const editedBody = editing || selected?.body || "";

  if (!room || room.status !== "open") {
    return (
      <div className="flex min-h-[calc(100dvh-60px)] flex-col">
        <RoomHeader session={session} room={room} />
        <Page>
          <Card className="p-8 text-center">
            <h2 className="text-[24px] font-bold">{facilitator ? "This room is closed." : "Waiting for the facilitator."}</h2>
            <p className="mx-auto mt-3 max-w-[56ch] text-[15px] leading-relaxed text-muted">
              {facilitator
                ? "Opening the room marks the session live and lets enrolled learners join, follow the active section, and work on the shared canvas."
                : "The room opens when your facilitator starts the session. You can keep working in any lab in the meantime."}
            </p>
            {session.meetingUri ? (
              <Callout tone="info" className="mx-auto mt-5 max-w-[62ch] text-left">
                The video call runs in Google Meet and opens in a separate tab. The shared canvas stays here, because Meet
                cannot be embedded in another page.
              </Callout>
            ) : null}
            {session.agenda ? (
              <p className="mx-auto mt-4 max-w-[62ch] rounded-[10px] bg-inset px-4 py-3 text-left text-[14px] text-muted">
                {session.agenda}
              </p>
            ) : null}
            {facilitator ? (
              <Button variant="primary" className="mt-6" disabled={busy} onClick={() => void act({ action: "open-room" })}>
                Open Live Room
              </Button>
            ) : null}
          </Card>
        </Page>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-60px)] flex-col overflow-hidden">
      <RoomHeader
        session={session}
        room={room}
        busy={busy}
        onClose={facilitator ? () => void act({ action: "close-room" }) : undefined}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line bg-raised px-5 py-2.5">
        <div className="min-w-0">
          <p className="eyebrow">Now covering</p>
          <p className="m-0 mt-0.5 text-[14px] font-bold">
            Lab {currentLab?.number ?? "?"} · {room.currentSection}
          </p>
        </div>
        {facilitator ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Active lab"
              className="rounded-[8px] border border-line bg-bg px-2.5 py-1.5 text-[13px]"
              value={room.currentLabId}
              onChange={(event) => void act({ action: "set-section", labId: event.target.value, section: room.currentSection })}
            >
              {labs.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  Lab {lab.number} · {lab.title}
                </option>
              ))}
            </select>
            <select
              aria-label="Active section"
              className="rounded-[8px] border border-line bg-bg px-2.5 py-1.5 text-[13px]"
              value={room.currentSection}
              onChange={(event) => void act({ action: "set-section", labId: room.currentLabId, section: event.target.value })}
            >
              {SECTIONS.map((section) => (
                <option key={section}>{section}</option>
              ))}
            </select>
          </div>
        ) : (
          <Badge tone="info">Facilitator controlled</Badge>
        )}
      </div>

      {banner ? (
        <div className="px-5 pt-3">
          <Callout tone="risk">{banner}</Callout>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-raised px-4 py-2">
            <div className="flex items-center gap-1" role="toolbar" aria-label="Whiteboard tools">
              {TOOLS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.hint}
                  aria-pressed={tool === item.id}
                  onClick={() => setTool(item.id)}
                  className={cx(
                    "grid h-8 min-w-[34px] place-items-center rounded-[7px] border px-2 text-[13px] font-semibold transition-colors",
                    tool === item.id ? "border-primary bg-primary text-primary-fg" : "border-line text-muted hover:bg-inset hover:text-fg",
                  )}
                >
                  <span aria-hidden>{item.glyph}</span>
                  <span className="sr-only">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              {Object.entries(COLORS).map(([item, swatch]) => (
                <button
                  key={item}
                  type="button"
                  aria-label={`${item} ink colour`}
                  aria-pressed={color === item}
                  onClick={() => setColor(item)}
                  className={cx(
                    "h-6 w-6 rounded-full border-2 transition-transform",
                    color === item ? "scale-110 border-fg" : "border-line",
                    swatch,
                  )}
                />
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {facilitator && selected && (selected.kind === "prompt" || selected.kind === "workflow") ? (
                <>
                  <select
                    aria-label="Class model"
                    className="rounded-[7px] border border-line bg-bg px-2 py-1.5 text-[12.5px]"
                    value={provider}
                    onChange={(event) => setProvider(event.target.value)}
                  >
                    {PROVIDERS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="primary" disabled={Boolean(runningId)} onClick={() => void run(selected.id, "run-card")}>
                    {runningId === selected.id ? "Running…" : "Run"}
                  </Button>
                  <Button size="sm" disabled={Boolean(runningId)} onClick={() => void run(selected.id, "run-chain")}>
                    Run chain
                  </Button>
                </>
              ) : null}
              {selected ? (
                <Button size="sm" variant="danger" onClick={() => void act({ action: "delete-card", cardId: selected.id })}>
                  Delete
                </Button>
              ) : null}
              <div className="flex overflow-hidden rounded-[7px] border border-line">
                {(["canvas", "list"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setBoardMode(mode)}
                    aria-pressed={boardMode === mode}
                    className={cx(
                      "px-2.5 py-1.5 text-[12.5px] font-semibold",
                      boardMode === mode ? "bg-primary text-primary-fg" : "text-muted hover:bg-inset",
                    )}
                  >
                    {mode === "canvas" ? "Canvas" : "List"}
                  </button>
                ))}
              </div>
              {facilitator ? (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act({ action: "clear-board" })}>
                  Clear section
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setPanelOpen((open) => !open)}>
                {panelOpen ? "Hide panel" : "Show panel"}
              </Button>
            </div>
          </div>

          {boardMode === "canvas" ? (
            <Whiteboard
              cards={positioned}
              canEdit
              tool={tool}
              color={color}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                if (tool === "connect") setConnectFrom(id);
              }}
              connectFrom={tool === "connect" ? connectFrom : null}
              runningId={runningId}
              onConnect={(sourceCardId, targetId) => {
                setConnectFrom(null);
                setSelectedId(null);
                void act({ action: "connect", sourceCardId, targetId }, true);
              }}
              onInteractingChange={setInteracting}
              onCreate={(card) => void act({ action: "add-card", ...card }, true)}
              onMove={(id, x, y) => {
                setPending((current) => ({ ...current, [id]: { x, y } }));
                void act({ action: "move-card", cardId: id, x, y }, true);
              }}
              onDelete={(id) => void act({ action: "delete-card", cardId: id }, true)}
            />
          ) : (
            <div className="flex-1 overflow-y-auto bg-bg">
              <BoardList
                cards={cards}
                canEdit
                onDelete={(id) => void act({ action: "delete-card", cardId: id })}
                onSelect={setSelectedId}
                selectedId={selectedId}
              />
            </div>
          )}
        </div>

        {panelOpen ? (
          <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-line bg-raised">
            <section className="border-b border-line px-4 py-4">
              <p className="eyebrow mb-2">Prompt under discussion</p>
              {room.sharedPrompt ? (
                <pre className="m-0 max-h-[200px] overflow-auto whitespace-pre-wrap rounded-[8px] bg-forest px-3 py-2.5 font-mono text-[12px] leading-relaxed text-white">
                  {room.sharedPrompt}
                </pre>
              ) : (
                <p className="m-0 text-[13px] text-muted">
                  {facilitator ? "Share a prompt to put it in front of everyone." : "Nothing shared yet."}
                </p>
              )}
              {room.sharedPrompt ? (
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() =>
                    void act(
                      { action: "add-card", kind: "prompt", body: room.sharedPrompt, color: "blue", x: 60, y: 60, width: 340, height: 200 },
                      true,
                    )
                  }
                >
                  Add to canvas
                </Button>
              ) : null}
              {facilitator ? (
                <div className="mt-3">
                  <label className="sr-only" htmlFor="share-prompt">
                    Share a prompt
                  </label>
                  <textarea
                    id="share-prompt"
                    rows={3}
                    value={promptDraft}
                    onChange={(event) => setPromptDraft(event.target.value)}
                    placeholder="Share a prompt for everyone to test…"
                    className="w-full resize-y rounded-[8px] border border-line bg-bg px-3 py-2 font-mono text-[12px] leading-relaxed placeholder:text-subtle focus:border-primary focus:outline-none"
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    className="mt-2 w-full"
                    disabled={busy || !promptDraft.trim()}
                    onClick={() => void act({ action: "share-prompt", prompt: promptDraft }).then(() => setPromptDraft(""))}
                  >
                    Share with room
                  </Button>
                </div>
              ) : null}
            </section>

            {selected && selected.kind !== "ink" ? (
              <section className="border-b border-line px-4 py-4">
                <p className="eyebrow mb-2">Edit {selected.kind}</p>
                <textarea
                  aria-label="Object text"
                  rows={4}
                  value={editedBody}
                  onChange={(event) => setEditing(event.target.value)}
                  className="w-full resize-y rounded-[8px] border border-line bg-bg px-3 py-2 text-[13px] focus:border-primary focus:outline-none"
                />
                <Button
                  size="sm"
                  variant="primary"
                  className="mt-2 w-full"
                  disabled={busy}
                  onClick={() =>
                    void act({ action: "update-card", cardId: selected.id, body: editedBody, color: selected.color }).then(() =>
                      setEditing(""),
                    )
                  }
                >
                  Save
                </Button>
              </section>
            ) : null}

            <section className="border-b border-line px-4 py-4">
              <p className="eyebrow mb-2">Quick artifacts</p>
              <p className="mb-2 text-[12.5px] text-muted">Drop a source from the active lab onto the canvas.</p>
              <div className="flex flex-wrap gap-1.5">
                {(currentLab?.sources ?? []).slice(0, 8).map((source, index) => (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() =>
                      void act(
                        {
                          action: "add-card",
                          kind: "artifact",
                          body: `${source.id} · ${source.title}`,
                          color: "blue",
                          payload: { sourceId: source.id },
                          x: 80 + index * 24,
                          y: 300 + index * 18,
                          width: 260,
                          height: 96,
                        },
                        true,
                      )
                    }
                    className="rounded-[6px] border border-line px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:border-line-strong hover:text-fg"
                  >
                    {source.id}
                  </button>
                ))}
              </div>
            </section>

            <section className="border-b border-line px-4 py-4">
              <p className="eyebrow mb-2">Executable canvas</p>
              <ol className="m-0 grid list-none gap-1.5 p-0 text-[12.5px] leading-relaxed text-muted">
                <li>1. Drop an artifact and a prompt card.</li>
                <li>2. With Connect, click the artifact then the prompt.</li>
                <li>3. Select the prompt and press Run. The output attaches below it.</li>
                <li>4. Chain workflow steps and press Run chain to execute the whole thing.</li>
              </ol>
              {!facilitator ? (
                <p className="mt-2 text-[12px] text-muted">Only the facilitator can run the class model.</p>
              ) : null}
            </section>

            <section className="px-4 py-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="eyebrow m-0">In the room · {participants.length}</p>
                {roomOpen ? (
                  <span
                    role="status"
                    aria-label={connected ? "Live connection active" : "Live connection reconnecting"}
                    className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-subtle"
                    title={connected
                      ? "Changes arrive instantly over a live connection."
                      : "The live connection dropped. Refreshing on a timer until it returns."}
                  >
                    <span
                      aria-hidden
                      className={cx("h-1.5 w-1.5 rounded-full", connected ? "bg-ok-fg" : "bg-warn-fg")}
                    />
                    {connected ? "Live" : "Reconnecting"}
                  </span>
                ) : null}
              </div>
              <ul className="m-0 grid list-none gap-0 p-0">
                {participants.map((participant) => (
                  <li key={participant.id} className="grid grid-cols-[24px_1fr_auto] items-center gap-2 border-t border-line py-2 first:border-t-0">
                    <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-forest text-[10px] font-bold text-white">
                      {participant.displayName.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 truncate text-[13px]">{participant.displayName}</span>
                    <span className="text-[10.5px] uppercase tracking-wide text-subtle">{participant.role}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                Learners see each other as participants, never by email address.
              </p>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function RoomHeader({
  session,
  room,
  onClose,
  busy,
}: {
  session: RoomState["session"];
  room: Room | null;
  onClose?: () => void;
  busy?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 bg-forest px-5 py-3.5 text-white">
      <div className="min-w-0">
        <p className="eyebrow !text-[color:var(--brand-mint)]">
          {session.cohortName ? `${session.cohortName} · ` : ""}
          {formatDateTime(session.scheduledAt)}
        </p>
        <h1 className="mt-1 text-[21px] font-bold">{session.title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {room?.status === "open" ? (
          <span className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.1em] text-[color:var(--brand-mint)]">
            <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-signal" />
            Live
          </span>
        ) : null}
        {session.meetingUri ? (
          <a
            href={session.meetingUri}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-[32px] items-center gap-2 rounded-[8px] border border-accent bg-accent px-3 text-[13px] font-semibold text-accent-fg no-underline transition-colors hover:brightness-110"
          >
            Join Google Meet ↗
          </a>
        ) : null}
        {onClose ? (
          <Button size="sm" variant="danger" disabled={busy} onClick={onClose}>
            Close room
          </Button>
        ) : null}
        <LinkButton href="/cohorts" variant="secondary" size="sm">
          Leave
        </LinkButton>
      </div>
    </header>
  );
}
