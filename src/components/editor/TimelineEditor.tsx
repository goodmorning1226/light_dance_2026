"use client";

import { useMemo } from "react";
import type { DanceProject, TimelineEvent } from "@/types";
import { eventsTouchingDancer, orderedDancers, totalBeatsOf } from "@/lib/editor/timelineHelpers";
import { BeatRuler } from "./BeatRuler";
import { DancerTrack } from "./DancerTrack";
import type { ViewMode } from "./ViewModeTabs";

interface Props {
  dance: DanceProject;
  viewMode: ViewMode;
  showGhostEvents: boolean;
  pxPerBeat: number;
  selectedEventId: string | null;
  currentBeat: number;
  editorsByEventId?: Record<string, string>;
  onSelectEvent: (id: string) => void;
  onAddEvent: () => void;
  onAddSection: () => void;
}

// Two-column layout:
//   - Left  (sticky, 120px): dancer name labels, never moves while the
//     timeline scrolls horizontally. The first row is a spacer so the labels
//     align with the dancer rows below the ruler.
//   - Right (scrollable): BeatRuler on top, then one DancerTrack per row.
//     Both share the same horizontal scroll, so beat ticks align with events.
//
// This separation is what fixes "events at beat 0..2 hide behind the label" —
// the labels live in their own column instead of being stacked over the
// track via position:sticky.
export function TimelineEditor({
  dance,
  viewMode,
  showGhostEvents,
  pxPerBeat,
  selectedEventId,
  currentBeat,
  editorsByEventId,
  onSelectEvent,
  onAddEvent,
  onAddSection,
}: Props) {
  const totalBeats = Math.max(8, totalBeatsOf(dance) + 4);
  const dancers = orderedDancers(dance);
  const events = dance.timelineEvents ?? [];

  const tracks = useMemo(() => {
    if (viewMode === "all") {
      return dancers.map((d) => ({
        dancer: d,
        events: events.filter((e) => eventsTouchingDancer(e, d.id)),
        ghosts: [] as TimelineEvent[],
      }));
    }
    const focusedId = viewMode.dancerId;
    const focused =
      dancers.find((d) => d.id === focusedId) ?? { id: focusedId, name: `Dancer ${focusedId}` };
    const own = events.filter((e) => eventsTouchingDancer(e, focusedId));
    const ghosts = showGhostEvents
      ? events.filter((e) => !eventsTouchingDancer(e, focusedId))
      : [];
    return [{ dancer: focused, events: own, ghosts }];
  }, [viewMode, showGhostEvents, dancers, events]);

  const labelColumnWidth = 120;
  const rulerHeight = 32;
  const rowHeight = 44;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row" style={{ padding: 8, borderBottom: "1px solid #e2e8f0", gap: 8 }}>
        <strong>Timeline</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          {events.length} events · {totalBeatsOf(dance)} beats · BPM {dance.bpm}
        </span>
        <span className="spacer" />
        <button onClick={onAddSection}>+ Section</button>
        <button className="primary" onClick={onAddEvent}>+ Event</button>
      </div>

      <div style={{ overflow: "auto", maxHeight: 480 }}>
        <div style={{ display: "flex", minWidth: "fit-content" }}>
          {/* Left column: sticky dancer labels */}
          <div
            style={{
              position: "sticky",
              left: 0,
              zIndex: 6,
              background: "white",
              flexShrink: 0,
              width: labelColumnWidth,
              borderRight: "1px solid #cbd5e1",
            }}
          >
            <div
              style={{
                height: rulerHeight,
                background: "#f1f5f9",
                borderBottom: "1px solid #94a3b8",
              }}
            />
            {tracks.map((t) => (
              <div
                key={`label-${t.dancer.id}`}
                style={{
                  height: rowHeight,
                  padding: "4px 8px",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#1e293b",
                  background: "#f8fafc",
                }}
              >
                <span style={{ fontFamily: "monospace", color: "#64748b" }}>#{t.dancer.id}</span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.dancer.name}
                </span>
              </div>
            ))}
            {tracks.length === 0 && (
              <div
                className="muted"
                style={{ height: rowHeight, padding: 8, fontSize: 11 }}
              >
                (no dancers)
              </div>
            )}
          </div>

          {/* Right column: ruler + tracks, share horizontal scroll */}
          <div style={{ flex: "0 0 auto" }}>
            <BeatRuler
              totalBeats={totalBeats}
              pxPerBeat={pxPerBeat}
              beatUnit={dance.beatUnit}
              sections={dance.sections}
              currentBeat={currentBeat}
            />
            {tracks.map((t) => (
              <DancerTrack
                key={t.dancer.id}
                events={t.events}
                pxPerBeat={pxPerBeat}
                totalBeats={totalBeats}
                selectedEventId={selectedEventId}
                ghostEvents={t.ghosts}
                currentBeat={currentBeat}
                {...(editorsByEventId !== undefined ? { editorsByEventId } : {})}
                onSelectEvent={onSelectEvent}
              />
            ))}
            {tracks.length === 0 && (
              <div
                className="muted"
                style={{ padding: 24, textAlign: "center", fontSize: 12 }}
              >
                Add a dancer in the Dance Meta panel.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
