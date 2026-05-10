"use client";

import { useRef, useState } from "react";
import type { TimelineEvent } from "@/types";
import { rgbToHex } from "@/lib/editor/colorConvert";

interface Props {
  event: TimelineEvent;
  pxPerBeat: number;
  selected: boolean;
  ghost?: boolean;
  active?: boolean;
  // Display name of another collaborator currently editing this event,
  // surfaced via the realtime broadcast channel. `null`/undefined ⇒ nobody.
  editingByName?: string | null;
  onClick: () => void;
  // When provided, the block can be dragged horizontally to change its
  // startBeat. Returns true if the move was committed; false → animate back
  // to the original position (overlap rejected).
  onDragMove?: (eventId: string, deltaBeats: number) => boolean;
}

const DRAG_THRESHOLD_PX = 4;

function summarise(event: TimelineEvent): string {
  if (event.actions.length === 0) return "(empty)";
  const a = event.actions[0]!;
  const more = event.actions.length > 1 ? ` +${event.actions.length - 1}` : "";
  if (a.type === "static") {
    const parts = a.parts ?? (a.part ? [a.part] : []);
    return `static ${parts.join("+") || "?"}${more}`;
  }
  return `${a.animationId ?? "?"} ${a.part ?? ""}`.trim() + more;
}

function bgColor(event: TimelineEvent): string {
  const a = event.actions[0];
  if (!a) return "#94a3b8";
  if (a.type === "animation" && a.animationId === "Rainbow") {
    return "linear-gradient(90deg,#ff5e5e,#ffb35e,#ffe85e,#9bff5e,#5e9bff,#b25eff)";
  }
  return rgbToHex(a.color);
}

// One block on the timeline. Width = durationBeats × pxPerBeat. Click selects.
// `ghost` styles the block as faded for cross-dancer reference; `active` pulses
// the border when the playhead is inside this event.
//
// When `onDragMove` is provided, the user can drag the block horizontally:
//   - During drag we keep a local `dragDeltaPx` to render the block at its
//     dragged position (no parent commit yet — the parent only commits if
//     the move is accepted, otherwise the block snaps back).
//   - On release we call onDragMove with the beat delta. The parent runs
//     overlap validation; if it returns true, our local delta is reset and
//     the block already lives at the new startBeat from the parent. If false,
//     we trigger a brief reject animation to communicate the snap-back.
//   - A pointerdown that doesn't move further than DRAG_THRESHOLD_PX is
//     treated as a click (selection) instead of a drag.
export function TimelineEventBlock({
  event,
  pxPerBeat,
  selected,
  ghost,
  active,
  editingByName,
  onClick,
  onDragMove,
}: Props) {
  const dragStartXRef = useRef<number | null>(null);
  const [dragDeltaPx, setDragDeltaPx] = useState(0);
  const [rejected, setRejected] = useState(false);
  const draggable = !!onDragMove && !ghost;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable || e.button !== 0) return;
    dragStartXRef.current = e.clientX;
    setDragDeltaPx(0);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartXRef.current === null) return;
    setDragDeltaPx(e.clientX - dragStartXRef.current);
  };
  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartXRef.current === null) return;
    const dx = e.clientX - dragStartXRef.current;
    dragStartXRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (Math.abs(dx) < DRAG_THRESHOLD_PX) {
      // Treat as a click — select the event without moving it.
      setDragDeltaPx(0);
      onClick();
      return;
    }
    const accepted = onDragMove?.(event.id, dx / pxPerBeat) ?? false;
    if (!accepted) {
      // Reject animation: keep showing the dragged offset for one tick, then
      // snap back so the user sees the block bounce home.
      setRejected(true);
      window.setTimeout(() => {
        setDragDeltaPx(0);
        setRejected(false);
      }, 180);
    } else {
      // Parent committed: dragDelta is no longer meaningful (left=startBeat
      // already updated). Reset.
      setDragDeltaPx(0);
    }
  };

  const left = event.startBeat * pxPerBeat + dragDeltaPx;
  const width = Math.max(event.durationBeats * pxPerBeat, 8);
  const background = bgColor(event);
  // editingByName takes priority for the border colour so collaborators are
  // unmistakable even on the currently-selected block.
  const borderColor = editingByName
    ? "#b45309"
    : active
      ? "#dc2626"
      : selected
        ? "#1f6feb"
        : "#1e293b";
  const opacity = ghost ? 0.25 : 1;

  return (
    <div
      onClick={draggable ? undefined : onClick}
      onPointerDown={draggable ? onPointerDown : undefined}
      onPointerMove={draggable ? onPointerMove : undefined}
      onPointerUp={draggable ? finishDrag : undefined}
      onPointerCancel={draggable ? finishDrag : undefined}
      title={`${event.label ?? event.id} · ${event.startBeat}b → ${event.startBeat + event.durationBeats}b · ${event.actions.length} action${event.actions.length === 1 ? "" : "s"}${editingByName ? ` · ${editingByName} editing` : ""}${draggable ? " · drag to move" : ""}`}
      style={{
        position: "absolute",
        left,
        top: 4,
        bottom: 4,
        width,
        background,
        border: `2px solid ${rejected ? "#dc2626" : borderColor}`,
        borderRadius: 4,
        opacity,
        cursor: ghost ? "default" : draggable ? "grab" : "pointer",
        overflow: "hidden",
        boxShadow: rejected
          ? "0 0 0 3px rgba(220,38,38,0.35)"
          : editingByName
            ? "0 0 0 2px rgba(180,83,9,0.35)"
            : active
              ? "0 0 0 1px #dc2626"
              : undefined,
        transition: dragStartXRef.current === null
          ? "left 0.18s ease-out, border-color 0.1s, box-shadow 0.18s"
          : "border-color 0.1s",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      {event.label ? (
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#0f172a",
            padding: "2px 4px 0",
            textShadow: "0 0 4px rgba(255,255,255,0.6)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {event.label}
        </div>
      ) : null}
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#0f172a",
          padding: event.label ? "0 4px 2px" : "2px 4px",
          textShadow: "0 0 4px rgba(255,255,255,0.6)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          opacity: event.label ? 0.75 : 1,
        }}
      >
        {event.startBeat}b · {summarise(event)}
        {event.clearBefore ? " · ⌫" : ""}
      </div>
      {editingByName && (
        <div
          style={{
            position: "absolute",
            top: -8,
            right: 2,
            background: "#b45309",
            color: "white",
            padding: "0 6px",
            borderRadius: 999,
            fontSize: 9,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {editingByName}
        </div>
      )}
    </div>
  );
}
