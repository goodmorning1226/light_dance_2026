"use client";

import { useCallback, useRef } from "react";
import type { DanceProject } from "@/types";
import { snapBeat } from "@/lib/editor/timelineHelpers";

interface Props {
  totalBeats: number;
  pxPerBeat: number;
  beatUnit: number;
  sections: DanceProject["sections"];
  currentBeat: number;
  // When provided, the ruler becomes interactive: click anywhere to seek the
  // playhead, or click-and-drag to scrub. Values are snapped to the dance's
  // beatUnit so the playhead lands on the editor's grid.
  onSeek?: (beat: number) => void;
}

// Renders a horizontal beat ruler with major ticks at every whole beat plus
// section boundary labels. The playhead position is rendered as a vertical
// line using `currentBeat * pxPerBeat`. When `onSeek` is provided, pointer
// events on the ruler scrub the playhead — clicking and dragging both work
// because we set pointer capture on pointerdown.
export function BeatRuler({
  totalBeats,
  pxPerBeat,
  beatUnit,
  sections,
  currentBeat,
  onSeek,
}: Props) {
  const totalPx = Math.max(totalBeats * pxPerBeat, 240);
  const tickCount = Math.max(1, Math.ceil(totalBeats) + 1);
  const ticks: number[] = Array.from({ length: tickCount }, (_, i) => i);
  const showSubTicks = beatUnit < 1;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const beatFromClientX = useCallback(
    (clientX: number): number => {
      const el = containerRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const px = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const rawBeat = px / pxPerBeat;
      const snapped = snapBeat(rawBeat, beatUnit);
      // Clamp to ruler range (one beat past the end is the natural drop-zone
      // for the next event, so allow it).
      return Math.max(0, Math.min(totalBeats, snapped));
    },
    [pxPerBeat, beatUnit, totalBeats],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onSeek(beatFromClientX(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onSeek || !draggingRef.current) return;
    onSeek(beatFromClientX(e.clientX));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "relative",
        height: 32,
        width: totalPx,
        borderBottom: "1px solid #94a3b8",
        background: "#f1f5f9",
        flexShrink: 0,
        cursor: onSeek ? "ew-resize" : "default",
        userSelect: "none",
        touchAction: "none",
      }}
      title={onSeek ? "Click or drag to move the playhead" : undefined}
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
            pointerEvents: "none",
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
                    pointerEvents: "none",
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
              pointerEvents: "none",
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

      {/* Playhead — visually wider grab handle so it's easier to drag. */}
      <div
        style={{
          position: "absolute",
          left: currentBeat * pxPerBeat - 4,
          top: 0,
          bottom: 0,
          width: 10,
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 0,
            bottom: 0,
            width: 2,
            background: "#dc2626",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 10,
            height: 8,
            background: "#dc2626",
            borderRadius: "0 0 4px 4px",
          }}
        />
      </div>
    </div>
  );
}
