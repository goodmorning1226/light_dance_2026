"use client";

import type { DanceProject } from "@/types";

interface Props {
  totalBeats: number;
  pxPerBeat: number;
  beatUnit: number;
  sections: DanceProject["sections"];
  currentBeat: number;
}

// Renders a horizontal beat ruler with major ticks at every whole beat plus
// section boundary labels. The playhead position is rendered as a vertical
// line using `currentBeat * pxPerBeat`.
export function BeatRuler({ totalBeats, pxPerBeat, beatUnit, sections, currentBeat }: Props) {
  const totalPx = Math.max(totalBeats * pxPerBeat, 240);
  // Ticks at every beat (whole numbers up to ceil(totalBeats))
  const tickCount = Math.max(1, Math.ceil(totalBeats) + 1);
  const ticks: number[] = Array.from({ length: tickCount }, (_, i) => i);
  const showSubTicks = beatUnit < 1;

  return (
    <div
      style={{
        position: "relative",
        height: 32,
        width: totalPx,
        borderBottom: "1px solid #94a3b8",
        background: "#f1f5f9",
        flexShrink: 0,
      }}
    >
      {ticks.map((b) => (
        <div
          key={`tick-${b}`}
          style={{
            position: "absolute",
            left: b * pxPerBeat,
            top: 0,
            bottom: 0,
            width: 1,
            background: b % 4 === 0 ? "#475569" : "#cbd5e1",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 4,
              top: 2,
              fontSize: 10,
              color: "#475569",
              fontFamily: "monospace",
            }}
          >
            {b}
          </span>
        </div>
      ))}

      {showSubTicks &&
        ticks.flatMap((b) => {
          const sub: JSX.Element[] = [];
          let frac = beatUnit;
          while (frac < 1) {
            const beatVal = b + frac;
            if (beatVal <= totalBeats) {
              sub.push(
                <div
                  key={`subtick-${beatVal}`}
                  style={{
                    position: "absolute",
                    left: beatVal * pxPerBeat,
                    top: 16,
                    bottom: 0,
                    width: 1,
                    background: "#e2e8f0",
                  }}
                />,
              );
            }
            frac += beatUnit;
          }
          return sub;
        })}

      {sections.map((s) => {
        const sb = s.startBeat ?? 0;
        return (
          <div
            key={`section-${s.id}`}
            style={{
              position: "absolute",
              left: sb * pxPerBeat,
              top: 0,
              bottom: 0,
              width: 2,
              background: "#1f6feb",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 4,
                top: 14,
                fontSize: 10,
                fontWeight: 600,
                color: "#1f6feb",
                whiteSpace: "nowrap",
                background: "#f1f5f9",
                padding: "0 4px",
              }}
            >
              {s.name}
            </span>
          </div>
        );
      })}

      {/* Playhead */}
      <div
        style={{
          position: "absolute",
          left: currentBeat * pxPerBeat,
          top: 0,
          bottom: 0,
          width: 2,
          background: "#dc2626",
          pointerEvents: "none",
          zIndex: 5,
        }}
      />
    </div>
  );
}
