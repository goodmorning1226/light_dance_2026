"use client";

import { BUILT_IN_ANIMATION_IDS, type BuiltInAnimationId } from "@/types";

const DESCRIPTIONS: Record<BuiltInAnimationId, { signature: string; summary: string }> = {
  ShowColor: {
    signature: "Animation::ShowColor(part, color, duration)",
    summary: "Paint a single body part with one color and hold for the duration.",
  },
  LTR: {
    signature: "Animation::LTR(part, color, duration)",
    summary: "Sweep color left-to-right across the body part.",
  },
  RTL: {
    signature: "Animation::RTL(part, color, duration)",
    summary: "Sweep color right-to-left across the body part.",
  },
  Center: {
    signature: "Animation::Center(part, color, duration)",
    summary: "Expand color outward from the center of the body part.",
  },
  Rainbow: {
    signature: "Animation::Rainbow(duration)",
    summary: "Animated rainbow across the entire LED strip.",
  },
  Multi: {
    signature: "Animation::Multi({ subAnimation, ... })",
    summary: "Run sub-animations in parallel. Editor UI does not yet expose this.",
  },
  Sequential: {
    signature: "Animation::Sequential({ subAnimation, ... })",
    summary: "Run sub-animations in order. Editor UI does not yet expose this.",
  },
};

export function BuiltInAnimationsList() {
  return (
    <div className="col" style={{ gap: 6 }}>
      {BUILT_IN_ANIMATION_IDS.map((id) => {
        const info = DESCRIPTIONS[id];
        return (
          <div
            key={id}
            className="card"
            style={{ padding: 10, background: "#f8fafc", borderColor: "#e2e8f0" }}
          >
            <div className="row" style={{ marginBottom: 4 }}>
              <strong style={{ fontFamily: "monospace" }}>{id}</strong>
              <span className="muted" style={{ fontFamily: "monospace", fontSize: 11 }}>
                {info.signature}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{info.summary}</div>
          </div>
        );
      })}
    </div>
  );
}
