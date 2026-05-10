"use client";

import type { TimelineWarning } from "@/lib/editor/timelineHelpers";

interface Props {
  warnings: ReadonlyArray<TimelineWarning>;
  onSelectEvent: (id: string) => void;
}

export function TimelineWarningsPanel({ warnings, onSelectEvent }: Props) {
  if (warnings.length === 0) {
    return (
      <div className="card" style={{ padding: 8, fontSize: 12 }}>
        <span className="muted">✓ no timeline warnings</span>
      </div>
    );
  }
  const errors = warnings.filter((w) => w.severity === "error");
  const warns = warnings.filter((w) => w.severity === "warn");

  return (
    <div className="card" style={{ padding: 8, fontSize: 12 }}>
      <div className="row" style={{ marginBottom: 4 }}>
        <strong>Timeline warnings</strong>
        <span className="spacer" />
        <span className="muted">{errors.length} error{errors.length === 1 ? "" : "s"} · {warns.length} warn{warns.length === 1 ? "" : "s"}</span>
      </div>
      <div className="col" style={{ gap: 4 }}>
        {warnings.map((w, i) => (
          <button
            key={i}
            className="ghost"
            onClick={() => w.eventId && onSelectEvent(w.eventId)}
            style={{
              textAlign: "left",
              padding: "4px 6px",
              borderLeft: `3px solid ${w.severity === "error" ? "#dc2626" : "#fbbf24"}`,
              cursor: w.eventId ? "pointer" : "default",
              background: "transparent",
            }}
          >
            <span style={{ color: w.severity === "error" ? "#991b1b" : "#92400e" }}>
              [{w.severity}]
            </span>{" "}
            {w.message}
          </button>
        ))}
      </div>
    </div>
  );
}
