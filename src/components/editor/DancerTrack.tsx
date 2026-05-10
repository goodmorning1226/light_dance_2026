"use client";

import type { TimelineEvent } from "@/types";
import { TimelineEventBlock } from "./TimelineEventBlock";

interface Props {
  events: ReadonlyArray<TimelineEvent>;
  pxPerBeat: number;
  totalBeats: number;
  selectedEventId: string | null;
  ghostEvents?: ReadonlyArray<TimelineEvent>;
  currentBeat: number;
  // eventId → display name of a remote collaborator currently editing it.
  editorsByEventId?: Record<string, string>;
  onSelectEvent: (id: string) => void;
}

// One row of the timeline grid. The dancer label is now rendered separately
// in the timeline's left column (see TimelineEditor) so this row starts at
// beat 0 = pixel 0 — events at small startBeats are no longer hidden under
// a sticky label.
export function DancerTrack({
  events,
  pxPerBeat,
  totalBeats,
  selectedEventId,
  ghostEvents,
  currentBeat,
  editorsByEventId,
  onSelectEvent,
}: Props) {
  const totalPx = Math.max(totalBeats * pxPerBeat, 240);
  const isActive = (e: TimelineEvent) =>
    currentBeat >= e.startBeat && currentBeat < e.startBeat + e.durationBeats;

  return (
    <div
      style={{
        position: "relative",
        height: 44,
        width: totalPx,
        borderBottom: "1px solid #e2e8f0",
        background: "white",
      }}
    >
      {ghostEvents?.map((e) => (
        <TimelineEventBlock
          key={`ghost-${e.id}`}
          event={e}
          pxPerBeat={pxPerBeat}
          selected={false}
          ghost
          onClick={() => {}}
        />
      ))}
      {events.map((e) => {
        const editorName = editorsByEventId?.[e.id] ?? null;
        return (
          <TimelineEventBlock
            key={e.id}
            event={e}
            pxPerBeat={pxPerBeat}
            selected={e.id === selectedEventId}
            active={isActive(e)}
            editingByName={editorName}
            onClick={() => onSelectEvent(e.id)}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          left: currentBeat * pxPerBeat,
          top: 0,
          bottom: 0,
          width: 2,
          background: "#dc2626",
          opacity: 0.6,
          pointerEvents: "none",
          zIndex: 5,
        }}
      />
    </div>
  );
}
