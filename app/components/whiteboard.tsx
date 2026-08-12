"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, cx } from "./ui";

export type BoardCard = {
  id: string;
  kind: "note" | "prompt" | "artifact" | "text" | "ink" | "output" | "workflow";
  body: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  payload: Record<string, unknown>;
  authorEmail: string;
  mine?: boolean;
  /** The lab this object was placed under, which is what resolves its source id. */
  sectionKey?: string;
};

/**
 * Which Northwind source an artifact card refers to.
 *
 * Mirrors the server's rule in the live-room route: an explicit `payload.sourceId`
 * wins, and a card typed by hand falls back to the first token of its body, which
 * is how `NW-ROADMAP-03 · Approved roadmap` still resolves.
 */
export const artifactSourceId = (card: BoardCard) =>
  String(card.payload?.sourceId ?? card.body.split(" ")[0] ?? "").trim();

export type Tool = "select" | "note" | "prompt" | "artifact" | "workflow" | "text" | "ink" | "connect" | "erase";

type Point = { x: number; y: number };

const CARD_STYLE: Record<string, string> = {
  blue: "bg-[#cfe3e8] text-[#12303a] border-[#a9cbd4]",
  yellow: "bg-[#f3e5a9] text-[#3d3413] border-[#ddcb85]",
  green: "bg-[#cfe4cf] text-[#173318] border-[#a9ceaa]",
  pink: "bg-[#efd2d1] text-[#3d1c1b] border-[#d9b0af]",
  ink: "bg-transparent text-inherit border-transparent",
};

const KIND_LABEL: Record<BoardCard["kind"], string> = {
  note: "Note",
  prompt: "Prompt",
  artifact: "Artifact",
  text: "Heading",
  ink: "Ink",
  output: "Model output",
  workflow: "Workflow step",
};

const inputsOf = (card: BoardCard) => (Array.isArray(card.payload?.inputs) ? (card.payload.inputs as string[]) : []);

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

/**
 * How far the pointer may travel before a press counts as a drag rather than a
 * click. Without it, the tremor in an ordinary click would register as a move and
 * an artifact could never be opened by clicking it.
 */
const DRAG_THRESHOLD_PX = 4;

/**
 * A real canvas: pan, zoom, drag objects, draw ink.
 *
 * Positions are persisted per object, so the board a facilitator arranges is the
 * board every participant sees. Interaction pauses the parent's polling through
 * `onInteractingChange` so a remote refresh cannot yank an object mid-drag.
 */
export function Whiteboard({
  cards,
  canEdit,
  tool,
  color,
  onCreate,
  onMove,
  onDelete,
  onSelect,
  selectedId,
  onInteractingChange,
  onConnect,
  connectFrom,
  runningId,
  onOpenArtifact,
}: {
  cards: BoardCard[];
  canEdit: boolean;
  tool: Tool;
  color: string;
  onCreate: (card: { kind: BoardCard["kind"]; body: string; color: string; x: number; y: number; width: number; height: number; payload?: Record<string, unknown> }) => void;
  onMove: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string | null) => void;
  selectedId: string | null;
  onInteractingChange: (interacting: boolean) => void;
  onConnect?: (sourceCardId: string, targetId: string) => void;
  connectFrom?: string | null;
  runningId?: string | null;
  /** Called when an artifact card is clicked rather than dragged. */
  onOpenArtifact?: (card: BoardCard) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [drag, setDrag] = useState<{ id: string; offset: Point; origin: Point } | null>(null);
  const [pan, setPan] = useState<Point | null>(null);
  const [stroke, setStroke] = useState<Point[]>([]);
  /** Local position overrides so dragging stays smooth before the server confirms. */
  const [ghost, setGhost] = useState<Record<string, Point>>({});
  /** Whether the current press has travelled far enough to be a drag. A ref, so
   *  crossing the threshold does not re-render mid-gesture. */
  const dragged = useRef(false);

  const toBoard = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (event.clientX - rect.left - view.x) / view.zoom,
        y: (event.clientY - rect.top - view.y) / view.zoom,
      };
    },
    [view],
  );

  useEffect(() => {
    onInteractingChange(Boolean(drag) || Boolean(pan) || stroke.length > 0);
  }, [drag, pan, stroke.length, onInteractingChange]);

  // Pointer move/up are bound to the window so a fast drag cannot escape the surface.
  useEffect(() => {
    if (!drag && !pan && stroke.length === 0) return;

    function handleMove(event: PointerEvent) {
      if (pan) {
        setView((current) => ({ ...current, x: current.x + (event.clientX - pan.x), y: current.y + (event.clientY - pan.y) }));
        setPan({ x: event.clientX, y: event.clientY });
        return;
      }
      const point = toBoard(event);
      if (drag) {
        if (!dragged.current) {
          const travel = Math.hypot(event.clientX - drag.origin.x, event.clientY - drag.origin.y);
          if (travel <= DRAG_THRESHOLD_PX) return;
          dragged.current = true;
        }
        setGhost((current) => ({ ...current, [drag.id]: { x: point.x - drag.offset.x, y: point.y - drag.offset.y } }));
        return;
      }
      if (stroke.length) setStroke((current) => [...current, point]);
    }

    function handleUp() {
      if (drag) {
        const position = ghost[drag.id];
        if (dragged.current && position) {
          onMove(drag.id, Math.round(position.x), Math.round(position.y));
        } else if (!dragged.current) {
          // A press that never became a drag is a click. An artifact opens; anything
          // else keeps the selection it already took on pointer down.
          const card = cards.find((item) => item.id === drag.id);
          if (card?.kind === "artifact") onOpenArtifact?.(card);
        }
        setDrag(null);
      }
      if (pan) setPan(null);
      if (stroke.length > 2) {
        const xs = stroke.map((point) => point.x);
        const ys = stroke.map((point) => point.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        onCreate({
          kind: "ink",
          body: "",
          color: "ink",
          x: Math.round(minX),
          y: Math.round(minY),
          width: Math.max(20, Math.round(Math.max(...xs) - minX)),
          height: Math.max(20, Math.round(Math.max(...ys) - minY)),
          payload: { points: stroke.map((point) => [Math.round(point.x - minX), Math.round(point.y - minY)]) },
        });
      }
      if (stroke.length) setStroke([]);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [cards, drag, ghost, onCreate, onMove, onOpenArtifact, pan, stroke, toBoard]);

  function handleSurfacePointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    const point = toBoard(event);

    if (tool === "ink" && canEdit) {
      setStroke([point]);
      return;
    }
    if (tool === "select" || !canEdit) {
      onSelect(null);
      setPan({ x: event.clientX, y: event.clientY });
      return;
    }
    // Placement tools drop a new object where you clicked.
    const defaults: Record<string, { body: string; width: number; height: number }> = {
      note: { body: "New note", width: 220, height: 140 },
      prompt: { body: "Write the prompt here…", width: 320, height: 180 },
      artifact: { body: "NW-…", width: 240, height: 110 },
      workflow: { body: "Describe this step…", width: 300, height: 150 },
      text: { body: "Heading", width: 300, height: 60 },
    };
    const preset = defaults[tool];
    if (!preset) return;
    onCreate({
      kind: tool as BoardCard["kind"],
      body: preset.body,
      color: tool === "text" ? "ink" : color,
      x: Math.round(point.x - preset.width / 2),
      y: Math.round(point.y - preset.height / 2),
      width: preset.width,
      height: preset.height,
    });
  }

  function handleWheel(event: React.WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setView((current) => ({
      ...current,
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom - event.deltaY * 0.002)),
    }));
  }

  const cursor =
    tool === "ink"
    ? "crosshair"
    : tool === "select"
      ? pan
        ? "grabbing"
        : "grab"
      : tool === "erase"
        ? "not-allowed"
        : tool === "connect"
          ? "cell"
          : "copy";

  return (
    <div className="relative flex-1 overflow-hidden bg-[color:var(--bg-inset)]">
      <div
        ref={surfaceRef}
        role="presentation"
        onPointerDown={handleSurfacePointerDown}
        onWheel={handleWheel}
        className="absolute inset-0 touch-none"
        style={{
          cursor,
          backgroundImage: "radial-gradient(var(--line-strong) 0.8px, transparent 0.8px)",
          backgroundSize: `${22 * view.zoom}px ${22 * view.zoom}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          <EdgeLayer cards={cards} ghost={ghost} />

          {cards.map((card) => {
            const position = ghost[card.id] ?? { x: card.x, y: card.y };
            return (
              <BoardObject
                key={card.id}
                card={card}
                x={position.x}
                y={position.y}
                selected={selectedId === card.id || connectFrom === card.id}
                running={runningId === card.id}
                canEdit={canEdit}
                onPointerDown={(event) => {
                  if (!canEdit || tool === "ink") return;
                  event.stopPropagation();
                  if (tool === "erase") {
                    onDelete(card.id);
                    return;
                  }
                  if (tool === "connect") {
                    if (!connectFrom) {
                      onSelect(card.id);
                    } else if (connectFrom !== card.id) {
                      onConnect?.(connectFrom, card.id);
                    }
                    return;
                  }
                  onSelect(card.id);
                  const point = toBoard(event);
                  dragged.current = false;
                  setDrag({
                    id: card.id,
                    offset: { x: point.x - card.x, y: point.y - card.y },
                    origin: { x: event.clientX, y: event.clientY },
                  });
                }}
              />
            );
          })}

          {stroke.length > 1 ? (
            <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
              <polyline
                points={stroke.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-[10px] border border-line bg-raised p-1 shadow-sm">
        <Button size="sm" variant="ghost" onClick={() => setView((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, v.zoom - 0.2) }))} aria-label="Zoom out">
          −
        </Button>
        <span className="min-w-[46px] text-center text-[12.5px] tabular-nums text-muted">{Math.round(view.zoom * 100)}%</span>
        <Button size="sm" variant="ghost" onClick={() => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, v.zoom + 0.2) }))} aria-label="Zoom in">
          +
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setView({ x: 0, y: 0, zoom: 1 })}>
          Reset
        </Button>
      </div>

      {cards.length === 0 ? (
        <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-[14px] text-muted">
          {canEdit ? "Pick a tool and click the canvas to place an object." : "The board is empty."}
          <br />
          <span className="text-[12.5px]">Drag empty space to pan · ⌘/Ctrl + scroll to zoom</span>
        </p>
      ) : null}
    </div>
  );
}


/** Draws the arrows between connected objects. Edges live on the target's payload. */
function EdgeLayer({ cards, ghost }: { cards: BoardCard[]; ghost: Record<string, Point> }) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const at = (card: BoardCard) => ghost[card.id] ?? { x: card.x, y: card.y };

  const edges = cards.flatMap((target) =>
    inputsOf(target).map((sourceId) => {
      const from = byId.get(sourceId);
      if (!from) return null;
      const a = at(from);
      const b = at(target);
      return {
        key: `${sourceId}->${target.id}`,
        x1: a.x + from.width / 2,
        y1: a.y + from.height,
        x2: b.x + target.width / 2,
        y2: b.y,
      };
    }),
  );

  const visible = edges.filter((edge): edge is NonNullable<typeof edge> => Boolean(edge));
  if (!visible.length) return null;

  return (
    <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1} aria-hidden>
      <defs>
        <marker id="edge-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
          <path d="M0 0 L9 4.5 L0 9 z" fill="var(--line-strong)" />
        </marker>
      </defs>
      {visible.map((edge) => {
        const midY = (edge.y1 + edge.y2) / 2;
        return (
          <path
            key={edge.key}
            d={`M${edge.x1},${edge.y1} C${edge.x1},${midY} ${edge.x2},${midY} ${edge.x2},${edge.y2}`}
            fill="none"
            stroke="var(--line-strong)"
            strokeWidth={1.8}
            markerEnd="url(#edge-arrow)"
          />
        );
      })}
    </svg>
  );
}

function BoardObject({
  card,
  x,
  y,
  selected,
  running,
  canEdit,
  onPointerDown,
}: {
  card: BoardCard;
  x: number;
  y: number;
  selected: boolean;
  running?: boolean;
  canEdit: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  const base = "absolute select-none";
  const style = { left: x, top: y, width: card.width, minHeight: card.height };

  if (card.kind === "ink") {
    const points = Array.isArray(card.payload?.points) ? (card.payload.points as number[][]) : [];
    return (
      <svg
        className={cx(base, "overflow-visible", canEdit && "cursor-move")}
        style={{ left: x, top: y, width: card.width, height: card.height }}
        onPointerDown={onPointerDown}
      >
        <polyline
          points={points.map(([px, py]) => `${px},${py}`).join(" ")}
          fill="none"
          stroke={selected ? "var(--primary)" : "var(--accent)"}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (card.kind === "text") {
    return (
      <div className={cx(base, canEdit && "cursor-move", selected && "ring-2 ring-primary")} style={style} onPointerDown={onPointerDown}>
        <p className="m-0 font-display text-[24px] font-bold leading-tight">{card.body}</p>
      </div>
    );
  }

  if (card.kind === "prompt") {
    return (
      <div
        className={cx(base, "overflow-hidden rounded-[10px] border border-line bg-raised shadow-md", canEdit && "cursor-move", selected && "ring-2 ring-primary")}
        style={style}
        onPointerDown={onPointerDown}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line bg-forest px-3 py-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-[color:var(--brand-mint)]">
            {running ? "Running…" : "Prompt"}
          </span>
          <span className="text-[10.5px] text-[color:var(--brand-mint)] opacity-80">
            {inputsOf(card).length ? `${inputsOf(card).length} input${inputsOf(card).length === 1 ? "" : "s"}` : card.authorEmail}
          </span>
        </div>
        <pre className="m-0 max-h-[220px] overflow-auto whitespace-pre-wrap px-3 py-2.5 font-mono text-[12px] leading-relaxed">{card.body}</pre>
      </div>
    );
  }


  if (card.kind === "output") {
    const usage = (card.payload?.usage ?? {}) as { totalTokens?: number };
    const cost = (card.payload?.cost ?? {}) as { estimatedUsd?: number | null };
    const model = String(card.payload?.model ?? "");
    const sourceIds = Array.isArray(card.payload?.sourceIds) ? (card.payload.sourceIds as string[]) : [];
    return (
      <div
        className={cx(base, "overflow-hidden rounded-[10px] border border-ok-line bg-raised shadow-md", canEdit && "cursor-move", selected && "ring-2 ring-primary")}
        style={style}
        onPointerDown={onPointerDown}
      >
        <div className="flex items-center justify-between gap-2 border-b border-ok-line bg-ok-bg px-3 py-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-ok-fg">Model output</span>
          <span className="font-mono text-[10px] text-ok-fg opacity-80">{model}</span>
        </div>
        <pre className="m-0 max-h-[240px] overflow-auto whitespace-pre-wrap px-3 py-2.5 font-mono text-[11.5px] leading-relaxed">{card.body}</pre>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-inset px-3 py-1.5 text-[10.5px] text-muted">
          <span>{usage.totalTokens ?? 0} tokens</span>
          <span>
            {cost.estimatedUsd === null || cost.estimatedUsd === undefined
              ? "unmetered"
              : `$${cost.estimatedUsd < 0.01 ? cost.estimatedUsd.toFixed(5) : cost.estimatedUsd.toFixed(3)}`}
          </span>
          {sourceIds.length ? <span className="font-mono">{sourceIds.join(" ")}</span> : <span>no sources</span>}
        </div>
      </div>
    );
  }

  if (card.kind === "workflow") {
    return (
      <div
        className={cx(base, "overflow-hidden rounded-[10px] border-2 border-dashed bg-raised shadow-sm", running ? "border-accent" : "border-line-strong", canEdit && "cursor-move", selected && "ring-2 ring-primary")}
        style={style}
        onPointerDown={onPointerDown}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
          <span className="eyebrow">{running ? "Running…" : "Workflow step"}</span>
          <span className="text-[10.5px] text-subtle">
            {inputsOf(card).length ? `${inputsOf(card).length} in` : "no inputs"}
          </span>
        </div>
        <p className="m-0 whitespace-pre-wrap px-3 py-2.5 text-[12.5px] leading-relaxed">{card.body}</p>
      </div>
    );
  }

  if (card.kind === "artifact") {
    return (
      <div
        className={cx(base, "group rounded-[10px] border-l-[4px] border border-l-accent border-line bg-raised px-3 py-2.5 shadow-md", canEdit && "cursor-move", selected && "ring-2 ring-primary")}
        style={style}
        onPointerDown={onPointerDown}
        title="Click to open this artifact"
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="eyebrow m-0">Artifact</p>
          <span aria-hidden className="text-[11px] text-subtle opacity-0 transition-opacity group-hover:opacity-100">
            Open ↗
          </span>
        </div>
        <p className="m-0 mt-1 font-mono text-[13px] font-bold">{card.body}</p>
      </div>
    );
  }

  return (
    <div
      className={cx(
        base,
        "rounded-[4px] border px-3 py-2.5 shadow-[0_3px_8px_rgb(0_0_0/12%)]",
        CARD_STYLE[card.color] ?? CARD_STYLE.blue,
        canEdit && "cursor-move",
        selected && "ring-2 ring-primary",
      )}
      style={style}
      onPointerDown={onPointerDown}
    >
      <p className="m-0 whitespace-pre-wrap text-[13px] leading-relaxed">{card.body}</p>
      <p className="m-0 mt-2 text-[10.5px] opacity-70">{card.authorEmail}</p>
    </div>
  );
}

/**
 * Keyboard and screen-reader accessible equivalent of the canvas.
 * The blueprint treats an infinite canvas without this as an accessibility failure,
 * so it is a peer view rather than a fallback.
 */
export function BoardList({
  cards,
  canEdit,
  onDelete,
  onSelect,
  selectedId,
  onOpenArtifact,
}: {
  cards: BoardCard[];
  canEdit: boolean;
  onDelete: (id: string) => void;
  onSelect: (id: string | null) => void;
  selectedId: string | null;
  /** Peer of the canvas click, so an artifact is reachable from the keyboard. */
  onOpenArtifact?: (card: BoardCard) => void;
}) {
  if (!cards.length) {
    return <p className="px-5 py-8 text-center text-[14px] text-muted">Nothing on the board yet.</p>;
  }
  return (
    <ul className="m-0 grid list-none gap-2 p-5">
      {cards.map((card) => (
        <li
          key={card.id}
          className={cx(
            "flex flex-wrap items-start justify-between gap-3 rounded-[10px] border bg-raised px-4 py-3",
            selectedId === card.id ? "border-primary" : "border-line",
          )}
        >
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <Badge>{KIND_LABEL[card.kind]}</Badge>
              <span className="text-[12px] text-muted">{card.authorEmail}</span>
              <span className="font-mono text-[11px] text-subtle">
                x{Math.round(card.x)} y{Math.round(card.y)}
              </span>
            </div>
            <p className="m-0 whitespace-pre-wrap text-[14px] leading-relaxed">
              {card.kind === "ink" ? <span className="text-muted">Freehand drawing</span> : card.body}
            </p>
          </div>
          <div className="flex gap-2">
            {card.kind === "artifact" && onOpenArtifact ? (
              <Button size="sm" onClick={() => onOpenArtifact(card)}>
                Open
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => onSelect(card.id)}>
              Select
            </Button>
            {canEdit && (card.mine ?? true) ? (
              <Button size="sm" variant="danger" onClick={() => onDelete(card.id)}>
                Delete
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
