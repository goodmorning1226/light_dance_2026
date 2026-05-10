"use client";

import type { Dancer } from "@/types";

export type ViewMode = "all" | { dancerId: number };

interface Props {
  dancers: ReadonlyArray<Dancer>;
  mode: ViewMode;
  onChange: (next: ViewMode) => void;
  showGhostEvents: boolean;
  onShowGhostEventsChange: (next: boolean) => void;
}

function isDancerMode(m: ViewMode, id: number): boolean {
  return typeof m === "object" && m.dancerId === id;
}

export function ViewModeTabs({ dancers, mode, onChange, showGhostEvents, onShowGhostEventsChange }: Props) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <span className="group-label">View</span>
      <button
        className={mode === "all" ? "primary" : ""}
        onClick={() => onChange("all")}
        title="Show all dancers' tracks"
      >
        All Dancers
      </button>
      {dancers.map((d) => (
        <button
          key={d.id}
          className={isDancerMode(mode, d.id) ? "primary" : ""}
          onClick={() => onChange({ dancerId: d.id })}
          title={`Edit dancer ${d.id}`}
        >
          {d.id}. {d.name}
        </button>
      ))}
      {mode !== "all" && (
        <label className="row" style={{ gap: 4, marginLeft: 12, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={showGhostEvents}
            onChange={(e) => onShowGhostEventsChange(e.target.checked)}
          />
          <span>show ghost events from other dancers</span>
        </label>
      )}
    </div>
  );
}
