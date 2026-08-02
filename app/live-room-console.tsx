"use client";

import { useEffect, useState } from "react";

const lessons = [
  ["lab-01", "Intake and structure"],
  ["lab-02", "Evidence-grounded writing"],
  ["lab-03", "Multi-source synthesis"],
  ["lab-04", "Decision preparation"],
  ["lab-05", "Red-team review"],
  ["lab-06", "Prompt regression testing"],
  ["lab-07", "Workflow audit"],
  ["lab-08", "Evaluation and promotion"],
] as const;

type RoomData = {
  identity: { email: string; displayName: string; role: "learner" | "facilitator" };
  facilitator: boolean;
  session: { id: string; title: string; cohortName: string; agenda: string; status: string };
  room: null | { id: string; status: string; currentLabId: string; currentSection: string; sharedPrompt: string; updatedAt: string };
  participants: Array<{ id: string; displayName: string; role: string; status: string; userEmail?: string }>;
  cards: Array<{ id: string; sectionKey: string; authorEmail: string; body: string; color: string }>;
};

export function LiveRoomConsole({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [data, setData] = useState<RoomData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [card, setCard] = useState("");
  const [color, setColor] = useState("blue");

  async function load(heartbeat = false) {
    const response = await fetch(`/api/live-room?sessionId=${encodeURIComponent(sessionId)}`);
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "Unable to load the Live Room"); return; }
    setData(body); setError("");
    if (heartbeat && body.room?.status === "open") {
      await fetch("/api/live-room", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "heartbeat", sessionId }) });
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void load(true), 0);
    const poll = window.setInterval(() => void load(true), 3000);
    return () => { window.clearTimeout(initial); window.clearInterval(poll); };
    // The selected session is the synchronization boundary for server-owned room state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function act(action: string, values: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    const response = await fetch("/api/live-room", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, sessionId, ...values }) });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setError(body.error ?? "Live Room action failed"); return false; }
    setData(body); return true;
  }

  const room = data?.room;
  const currentIndex = lessons.findIndex(([id]) => id === room?.currentLabId);
  const visibleCards = data?.cards.filter((item) => item.sectionKey === room?.currentLabId) ?? [];

  return <div className="live-room-backdrop" role="presentation"><section className="live-room" role="dialog" aria-modal="true" aria-labelledby="live-room-title">
    <header><div><span className="live-indicator"><i></i>{room?.status === "open" ? "Live now" : "Live Room"}</span><h2 id="live-room-title">{data?.session.title ?? "Loading session…"}</h2><small>{data?.session.cohortName}</small></div><button type="button" onClick={onClose} aria-label="Close Live Room">×</button></header>
    {error && <p className="phase2-message error" role="alert">{error}</p>}
    {!data ? <p className="live-room-waiting">Connecting to the session…</p> : !room || room.status === "closed" ? <div className="live-room-waiting"><span className="eyebrow">Session lobby</span><h3>{data.facilitator ? "Open the room when you’re ready" : "Waiting for the facilitator"}</h3><p>{data.session.agenda || "The shared lesson, prompt, and whiteboard will appear here."}</p>{data.facilitator && <button className="phase2-primary" disabled={busy} onClick={() => act("open-room")}>Open Live Room</button>}</div> : <>
      <div className="live-room-toolbar"><div><span>Lesson progression</span><strong>{currentIndex + 1} of {lessons.length} · {room.currentSection}</strong></div>{data.facilitator ? <div className="lesson-controls"><button disabled={busy || currentIndex <= 0} onClick={() => act("set-section", { labId: lessons[currentIndex - 1][0], section: lessons[currentIndex - 1][1] })}>Previous</button><select aria-label="Current lesson" value={room.currentLabId} onChange={(event) => { const lesson = lessons.find(([id]) => id === event.target.value); if (lesson) void act("set-section", { labId: lesson[0], section: lesson[1] }); }}>{lessons.map(([id, label], index) => <option key={id} value={id}>{index + 1}. {label}</option>)}</select><button disabled={busy || currentIndex >= lessons.length - 1} onClick={() => act("set-section", { labId: lessons[currentIndex + 1][0], section: lessons[currentIndex + 1][1] })}>Next</button></div> : <span className="trainer-controlled">Trainer controlled</span>}</div>
      <div className="live-room-grid"><main><section className="shared-prompt"><span className="eyebrow">Shared prompt</span>{room.sharedPrompt ? <pre>{room.sharedPrompt}</pre> : <p>The facilitator has not shared a prompt yet.</p>}{data.facilitator && <div><textarea rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Share a prompt for everyone to test…" /><button className="phase2-primary" disabled={busy || !prompt.trim()} onClick={async () => { if (await act("share-prompt", { prompt })) setPrompt(""); }}>Share with room</button></div>}</section><section className="room-whiteboard"><div className="whiteboard-heading"><div><span className="eyebrow">Section whiteboard</span><h3>{room.currentSection}</h3></div>{data.facilitator && visibleCards.length > 0 && <button disabled={busy} onClick={() => act("clear-board")}>Clear section</button>}</div><div className="whiteboard-canvas">{visibleCards.length ? visibleCards.map((item) => <article className={`board-card ${item.color}`} key={item.id}><p>{item.body}</p><small>{item.authorEmail}</small></article>) : <p className="empty-board">Capture questions, examples, risks, and takeaways for this section.</p>}</div><div className="board-composer"><textarea rows={2} value={card} onChange={(event) => setCard(event.target.value)} placeholder="Add a note to the shared whiteboard…" /><select aria-label="Note color" value={color} onChange={(event) => setColor(event.target.value)}><option value="blue">Blue</option><option value="yellow">Yellow</option><option value="green">Green</option><option value="pink">Pink</option></select><button className="phase2-secondary" disabled={busy || !card.trim()} onClick={async () => { if (await act("add-card", { body: card, color })) setCard(""); }}>Add note</button></div></section></main><aside><span className="eyebrow">In the room</span><strong>{data.participants.length} present</strong>{data.participants.map((person) => <div className="presence-row" key={person.id}><i></i><span>{person.userEmail ?? person.displayName}</span><small>{person.role}</small></div>)}<p>{data.session.agenda}</p>{data.facilitator && <button className="close-room-action" disabled={busy} onClick={() => act("close-room")}>End session</button>}</aside></div>
    </>}
  </section></div>;
}
