"use client";

import { useMemo } from "react";
import type { DanceProject } from "@/types";
import { computeTimelineDisplayAtBeat } from "@/lib/editor/previewModel";
import { totalBeatsOf } from "@/lib/editor/timelineHelpers";
import { DanceFigure } from "./DanceFigure";

interface Props {
  dance: DanceProject;
  currentBeat: number;
}

export function VisualPreview({ dance, currentBeat }: Props) {
  const events = dance.timelineEvents ?? [];
  const displays = useMemo(
    () => computeTimelineDisplayAtBeat(events, currentBeat, dance.dancers),
    [events, currentBeat, dance.dancers],
  );

  const total = totalBeatsOf(dance);
  const beatMs = (60000 / Math.max(dance.bpm, 1)) * currentBeat;

  return (
    <div className="col" style={{ gap: 8, height: "100%", minHeight: 0 }}>
      <div className="row" style={{ gap: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          Beat {currentBeat.toFixed(2)} / {total} · {Math.round(beatMs)} ms
        </span>
      </div>

      <div
        className="card"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: "center",
          alignContent: "flex-start",
          padding: 16,
        }}
      >
        {dance.dancers.length === 0 && (
          <span className="muted">No dancers in this dance.</span>
        )}
        {displays.map((d) => (
          <DanceFigure key={d.dancerId} display={d} />
        ))}
      </div>
    </div>
  );
}
