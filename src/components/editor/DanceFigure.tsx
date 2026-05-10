"use client";

import type { ColorRGB } from "@/types";
import { rgbToHex } from "@/lib/editor/colorConvert";
import type { DancerDisplay, PreviewSlot } from "@/lib/editor/previewModel";

interface Props {
  display: DancerDisplay;
}

const OFF_FILL = "#1f2937";
const STROKE = "#0f172a";

// Pure black is indistinguishable from "off". Treat it as off in the preview
// so users notice when an action is missing rather than thinking the figure
// is intentionally lit black.
function slotFill(c: ColorRGB | undefined): string {
  if (!c) return OFF_FILL;
  if (c.r === 0 && c.g === 0 && c.b === 0) return OFF_FILL;
  return rgbToHex(c);
}

// Layout for the 21 atomic preview slots inside a 100x180 SVG. Each entry
// is one rectangle painted with that slot's color. Order matters only for
// overlap (later draws on top); the layout below is non-overlapping so it
// doesn't matter.
interface Rect {
  slot: PreviewSlot;
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  title: string;
}

const RECTS: Rect[] = [
  // Hat — three horizontal zones
  { slot: "beforeHatMark", x: 25, y: 2, w: 12, h: 18, rx: 2, title: "beforeHatMark" },
  { slot: "hatMark",       x: 38, y: 2, w: 24, h: 18, rx: 2, title: "hatMark" },
  { slot: "afterHatMark",  x: 63, y: 2, w: 12, h: 18, rx: 2, title: "afterHatMark" },

  // Torso — collar on top, three vertical strips below, lowerShirt at bottom
  { slot: "collar",     x: 28, y: 24, w: 44, h: 8,  rx: 2, title: "collar" },
  { slot: "leftZipper", x: 28, y: 33, w: 8,  h: 30, rx: 1, title: "leftZipper" },
  { slot: "shirt",      x: 37, y: 33, w: 26, h: 30, rx: 1, title: "shirt" },
  { slot: "rightZipper",x: 64, y: 33, w: 8,  h: 30, rx: 1, title: "rightZipper" },
  { slot: "lowerShirt", x: 28, y: 64, w: 44, h: 12, rx: 2, title: "lowerShirt" },

  // Left arm column
  { slot: "leftUpperArm", x: 4,  y: 24, w: 18, h: 22, rx: 3, title: "leftUpperArm" },
  { slot: "leftLowerArm", x: 4,  y: 47, w: 18, h: 22, rx: 3, title: "leftLowerArm" },
  { slot: "leftHand",     x: 4,  y: 70, w: 18, h: 14, rx: 3, title: "leftHand" },
  // Right arm column
  { slot: "rightUpperArm", x: 78, y: 24, w: 18, h: 22, rx: 3, title: "rightUpperArm" },
  { slot: "rightLowerArm", x: 78, y: 47, w: 18, h: 22, rx: 3, title: "rightLowerArm" },
  { slot: "rightHand",     x: 78, y: 70, w: 18, h: 14, rx: 3, title: "rightHand" },

  // Crotch row — three side-by-side
  { slot: "leftCrotch",  x: 28, y: 78, w: 14, h: 12, rx: 2, title: "leftCrotch" },
  { slot: "crotch",      x: 43, y: 78, w: 14, h: 12, rx: 2, title: "crotch" },
  { slot: "rightCrotch", x: 58, y: 78, w: 14, h: 12, rx: 2, title: "rightCrotch" },

  // Legs — left and right
  { slot: "leftLeg",  x: 28, y: 91, w: 18, h: 50, rx: 3, title: "leftLeg" },
  { slot: "rightLeg", x: 54, y: 91, w: 18, h: 50, rx: 3, title: "rightLeg" },

  // Feet
  { slot: "leftFoot",  x: 26, y: 142, w: 22, h: 14, rx: 3, title: "leftFoot" },
  { slot: "rightFoot", x: 52, y: 142, w: 22, h: 14, rx: 3, title: "rightFoot" },
];

export function DanceFigure({ display }: Props) {
  return (
    <div
      className="col"
      style={{ alignItems: "center", gap: 4, minWidth: 110 }}
    >
      <span style={{ fontSize: 12, fontWeight: 600 }}>
        {display.dancerId}. {display.name}
      </span>
      <svg
        viewBox="0 0 100 160"
        width={100}
        height={160}
        style={{ display: "block" }}
        role="img"
        aria-label={`Dancer ${display.dancerId} preview`}
      >
        {RECTS.map((r) => (
          <rect
            key={r.slot}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={r.rx ?? 1}
            fill={slotFill(display.slots[r.slot])}
            stroke={STROKE}
            strokeWidth={0.4}
          >
            <title>{r.title}</title>
          </rect>
        ))}
      </svg>
      <div
        className="row"
        style={{ flexWrap: "wrap", gap: 2, justifyContent: "center", minHeight: 18 }}
      >
        {display.labels.map((label) => (
          <span
            key={label}
            className="chip"
            style={{
              fontSize: 10,
              padding: "1px 6px",
              background: "#fbbf24",
              color: "#1a1a1a",
              borderColor: "#fbbf24",
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
