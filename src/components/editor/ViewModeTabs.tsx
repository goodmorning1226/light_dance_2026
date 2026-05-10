"use client";

import type { Dancer } from "@/types";

// "all" → show every dancer's track. `{ dancerIds: [...] }` → only those
// dancers' tracks (multi-select). Empty arrays are normalised to "all" by the
// click handler below; consumers can assume `dancerIds.length >= 1`.
export type ViewMode = "all" | { dancerIds: number[] };

interface Props {
  dancers: ReadonlyArray<Dancer>;
  mode: ViewMode;
  onChange: (next: ViewMode) => void;
  showGhostEvents: boolean;
  onShowGhostEventsChange: (next: boolean) => void;
}

function isDancerSelected(mode: ViewMode, id: number): boolean {
  return mode === "all" || mode.dancerIds.includes(id);
}

export function ViewModeTabs({
  dancers,
  mode,
  onChange,
  showGhostEvents,
  onShowGhostEventsChange,
}: Props) {
  const selectedCount =
    mode === "all" ? dancers.length : mode.dancerIds.length;

  // Click semantics:
  //   - In "all" mode → focus on this single dancer.
  //   - In subset mode → toggle membership.
  //   - The single remaining selection is sticky: clicking it does nothing
  //     (so users can't accidentally fall back to "all" — they have to click
  //     the explicit "All Dancers" button).
  // Hold shift to add/remove without leaving subset mode (otherwise a single
  // click on a non-selected dancer in "all" mode jumps to single-focus).
  const onDancerClick = (id: number, additive: boolean) => {
    if (mode === "all") {
      if (additive) {
        // shift-click in "all" → exclude this dancer (everyone except this one)
        const ids = dancers.map((d) => d.id).filter((x) => x !== id);
        if (ids.length === 0) onChange({ dancerIds: [id] });
        else onChange({ dancerIds: ids });
      } else {
        onChange({ dancerIds: [id] });
      }
      return;
    }
    const has = mode.dancerIds.includes(id);
    if (has && mode.dancerIds.length === 1) {
      // Last selected dancer: ignore the click. Use the "All Dancers" button
      // to escape single-dancer view.
      return;
    }
    const next = has
      ? mode.dancerIds.filter((x) => x !== id)
      : [...mode.dancerIds, id].sort((a, b) => a - b);
    if (next.length === dancers.length) onChange("all");
    else onChange({ dancerIds: next });
  };

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
      {dancers.map((d) => {
        const selected = isDancerSelected(mode, d.id);
        const isLastInSubset =
          mode !== "all" && mode.dancerIds.length === 1 && mode.dancerIds[0] === d.id;
        return (
          <button
            key={d.id}
            className={selected ? "primary" : ""}
            onClick={(e) => onDancerClick(d.id, e.shiftKey)}
            title={
              isLastInSubset
                ? "Last selected dancer — click \"All Dancers\" to reset, or shift+click another dancer to add"
                : `Click: focus on dancer ${d.id} · Shift+Click: toggle in/out of multi-select`
            }
            style={isLastInSubset ? { cursor: "default", opacity: 0.95 } : undefined}
          >
            {d.id}. {d.name}
          </button>
        );
      })}
      <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>
        {mode === "all"
          ? "(showing all)"
          : `(${selectedCount}/${dancers.length} selected · shift-click to toggle)`}
      </span>
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
