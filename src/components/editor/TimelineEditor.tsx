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
  onSeek: (beat: number) => void;
  // Per-dancer "+ Event" button (renders next to the dancer label). Creates a
  // personal event locked to this dancer.
  onAddPersonalEvent: (dancerId: number) => void;
  // Top "+ Common Event" button — opens the modal in the parent.
  onOpenCommonEventModal: () => void;
  // Section creation — parent inserts at the current playhead position.
  onAddSection: () => void;
}

export function TimelineEditor({
  dance,
  viewMode,
  showGhostEvents,
  pxPerBeat,
  selectedEventId,
  currentBeat,
  editorsByEventId,
  onSelectEvent,
  onSeek,
  onAddPersonalEvent,
  onOpenCommonEventModal,
  onAddSection,
}: Props) {
  const totalBeats = Math.max(8, totalBeatsOf(dance) + 4);
  const dancers = orderedDancers(dance);
  const events = dance.timelineEvents ?? [];

  const tracks = useMemo(() => {
    const visibleDancers =
      viewMode === "all"
        ? dancers
        : dancers.filter((d) => viewMode.dancerIds.includes(d.id));
    if (visibleDancers.length === 0) {
      return dancers.map((d) => ({
        dancer: d,
        events: events.filter((e) => eventsTouchingDancer(e, d.id)),
        ghosts: [] as TimelineEvent[],
      }));
    }
    const visibleIds = new Set(visibleDancers.map((d) => d.id));
    const showGhosts = viewMode !== "all" && showGhostEvents;
    return visibleDancers.map((d) => {
      const own = events.filter((e) => eventsTouchingDancer(e, d.id));
      const ghosts = showGhosts
        ? events.filter((e) => {
            if (eventsTouchingDancer(e, d.id)) return false;
            return e.actions.some((a) => a.dancers.some((x) => !visibleIds.has(x)));
          })
        : [];
      return { dancer: d, events: own, ghosts };
    });
  }, [viewMode, showGhostEvents, dancers, events]);

  const labelColumnWidth = 168;
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
        <button onClick={onAddSection} title="Insert a section at the current playhead">
          + Section
        </button>
        <button
          className="primary"
          onClick={onOpenCommonEventModal}
          title="Pick dancers + author actions in a modal; on Apply each dancer gets their own personal event"
        >
          + Common Event
        </button>
      </div>

      <div style={{ overflow: "auto", maxHeight: 480 }}>
        <div style={{ display: "flex", minWidth: "fit-content" }}>
          {/* Left column: sticky dancer labels + per-dancer Add button */}
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
                    flex: 1,
                  }}
                  title={t.dancer.name}
                >
                  {t.dancer.name}
                </span>
                <button
                  onClick={() => onAddPersonalEvent(t.dancer.id)}
                  title={`Add a personal event for ${t.dancer.name} at the playhead`}
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    minWidth: 28,
                    background: "#1f6feb",
                    color: "white",
                    border: "none",
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                >
                  + Event
                </button>
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

          {/* Right column: ruler (interactive) + tracks, share horizontal scroll */}
          <div style={{ flex: "0 0 auto" }}>
            <BeatRuler
              totalBeats={totalBeats}
              pxPerBeat={pxPerBeat}
              beatUnit={dance.beatUnit}
              sections={dance.sections}
              currentBeat={currentBeat}
              onSeek={onSeek}
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
