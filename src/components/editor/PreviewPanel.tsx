"use client";

import { useMemo, useState } from "react";
import type { DanceProject, ExportMode, TimelineEvent } from "@/types";
import { exportDanceToJson } from "@/lib/io";
import { generateDanceCpp } from "@/lib/codegen";
import { VisualPreview } from "./VisualPreview";

interface Props {
  dance: DanceProject;
  currentBeat: number;
  selectedEventId: string | null;
}

type Tab = "visual" | "cpp" | "json";

export function PreviewPanel({ dance, currentBeat, selectedEventId }: Props) {
  const [tab, setTab] = useState<Tab>("visual");
  const [exportMode, setExportMode] = useState<ExportMode>("online");

  const json = useMemo(() => exportDanceToJson(dance), [dance]);
  const cpp = useMemo(() => {
    try {
      return { ok: true as const, value: generateDanceCpp(dance, exportMode) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [dance, exportMode]);

  // The visual tab shows the LED state for either:
  //   - the playhead position (during/after Play), or
  //   - the selected event's startBeat (when paused at beat 0 and an event is selected).
  // This makes "click an event → see what it paints" still work without
  // forcing the playhead.
  const events = dance.timelineEvents ?? [];
  const previewBeat = useMemo(() => {
    if (currentBeat > 0) return currentBeat;
    const selected: TimelineEvent | undefined = events.find((e) => e.id === selectedEventId);
    return selected ? selected.startBeat : 0;
  }, [currentBeat, selectedEventId, events]);

  return (
    <div className="col" style={{ gap: 8, height: "100%" }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => setTab("visual")} className={tab === "visual" ? "primary" : ""}>
          Visual
        </button>
        <button onClick={() => setTab("cpp")} className={tab === "cpp" ? "primary" : ""}>
          C++
        </button>
        <button onClick={() => setTab("json")} className={tab === "json" ? "primary" : ""}>
          JSON
        </button>
        <span className="spacer" />
        {tab === "cpp" && (
          <>
            <span className="group-label">mode</span>
            <select
              value={exportMode}
              onChange={(e) => setExportMode(e.target.value as ExportMode)}
            >
              <option value="online">online</option>
              <option value="offline">offline</option>
            </select>
          </>
        )}
      </div>

      {tab === "visual" && (
        <VisualPreview dance={dance} currentBeat={previewBeat} />
      )}

      {tab === "cpp" && (
        <>
          {!cpp.ok && <div className="error">Codegen failed: {cpp.error}</div>}
          <pre style={{ flex: 1, minHeight: 400 }}>{cpp.ok ? cpp.value : ""}</pre>
        </>
      )}

      {tab === "json" && (
        <pre style={{ flex: 1, minHeight: 400 }}>{json}</pre>
      )}
    </div>
  );
}
