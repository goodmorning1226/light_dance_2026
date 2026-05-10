"use client";

import type { ColorRGB } from "@/types";
import { rgbToHex } from "@/lib/editor/colorConvert";
import type { DancerDisplay } from "@/lib/editor/previewModel";

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

export function DanceFigure({ display }: Props) {
  return (
    <div
      className="col"
      style={{ alignItems: "center", gap: 4, minWidth: 90 }}
    >
      <span style={{ fontSize: 12, fontWeight: 600 }}>
        {display.dancerId}. {display.name}
      </span>
      <svg
        viewBox="0 0 80 124"
        width={80}
        height={124}
        style={{ display: "block" }}
        role="img"
        aria-label={`Dancer ${display.dancerId} preview`}
      >
        {/* hat */}
        <rect x={22} y={2} width={36} height={20} rx={4} fill={slotFill(display.slots.hat)} stroke={STROKE} strokeWidth={0.5} />
        {/* arms (upper) */}
        <rect x={2} y={26} width={14} height={32} rx={3} fill={slotFill(display.slots.leftArm)} stroke={STROKE} strokeWidth={0.5} />
        <rect x={64} y={26} width={14} height={32} rx={3} fill={slotFill(display.slots.rightArm)} stroke={STROKE} strokeWidth={0.5} />
        {/* body */}
        <rect x={20} y={26} width={40} height={42} rx={4} fill={slotFill(display.slots.body)} stroke={STROKE} strokeWidth={0.5} />
        {/* hands */}
        <rect x={2} y={60} width={14} height={12} rx={3} fill={slotFill(display.slots.leftHand)} stroke={STROKE} strokeWidth={0.5} />
        <rect x={64} y={60} width={14} height={12} rx={3} fill={slotFill(display.slots.rightHand)} stroke={STROKE} strokeWidth={0.5} />
        {/* legs */}
        <rect x={22} y={70} width={36} height={32} rx={4} fill={slotFill(display.slots.legs)} stroke={STROKE} strokeWidth={0.5} />
        {/* feet */}
        <rect x={22} y={104} width={36} height={14} rx={3} fill={slotFill(display.slots.feet)} stroke={STROKE} strokeWidth={0.5} />
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
