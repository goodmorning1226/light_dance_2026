"use client";

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
}

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
export function TimelineEventBlock({
  event,
  pxPerBeat,
  selected,
  ghost,
  active,
  editingByName,
  onClick,
}: Props) {
  const left = event.startBeat * pxPerBeat;
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
      onClick={onClick}
      title={`${event.label ?? event.id} · ${event.startBeat}b → ${event.startBeat + event.durationBeats}b · ${event.actions.length} action${event.actions.length === 1 ? "" : "s"}${editingByName ? ` · ${editingByName} editing` : ""}`}
      style={{
        position: "absolute",
        left,
        top: 4,
        bottom: 4,
        width,
        background,
        border: `2px solid ${borderColor}`,
        borderRadius: 4,
        opacity,
        cursor: ghost ? "default" : "pointer",
        overflow: "hidden",
        boxShadow: editingByName
          ? "0 0 0 2px rgba(180,83,9,0.35)"
          : active
            ? "0 0 0 1px #dc2626"
            : undefined,
        transition: "border-color 0.1s",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#0f172a",
          padding: "2px 4px",
          textShadow: "0 0 4px rgba(255,255,255,0.6)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
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
