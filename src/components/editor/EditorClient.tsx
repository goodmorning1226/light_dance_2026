"use client";

import { useEffect, useMemo, useState } from "react";
import type { DanceProject, TimelineEvent } from "@/types";
import {
  addDanceToProgram,
  getAllCustomAnimations,
  getAllDances,
  getCurrentDanceId,
  getDance,
  saveDance,
  setCurrentDanceId,
} from "@/lib/storage";
import {
  exportDanceToJson,
  importDanceFromJson,
} from "@/lib/io";
import { createEmptyDance, createEmptySection } from "@/lib/editor/factories";
import {
  ensureReferencedCustomsAttached,
  mergeCustomAnimations,
} from "@/lib/editor/customAnimRefs";
import { migrateStepsToTimelineEvents } from "@/lib/editor/migration";
import {
  collectTimelineWarnings,
  totalBeatsOf,
} from "@/lib/editor/timelineHelpers";
import { DanceMetaPanel } from "./DanceMetaPanel";
import { PreviewPanel } from "./PreviewPanel";
import { TimelineEditor } from "./TimelineEditor";
import { TimelineEventEditor, buildEmptyEvent } from "./TimelineEventEditor";
import { TimelineWarningsPanel } from "./TimelineWarningsPanel";
import { ViewModeTabs, type ViewMode } from "./ViewModeTabs";

type Notice = { kind: "info" | "error"; text: string } | null;

const PX_PER_BEAT = 60;
const EDITOR_UI_KEY = "ld26:editorUiState";

interface EditorUiState {
  viewMode: ViewMode;
  showGhostEvents: boolean;
  selectedEventId: string | null;
}

function loadEditorUiState(): EditorUiState {
  if (typeof window === "undefined") {
    return { viewMode: "all", showGhostEvents: false, selectedEventId: null };
  }
  try {
    const raw = window.localStorage.getItem(EDITOR_UI_KEY);
    if (!raw) return { viewMode: "all", showGhostEvents: false, selectedEventId: null };
    const parsed = JSON.parse(raw) as Partial<EditorUiState>;
    return {
      viewMode: parsed.viewMode ?? "all",
      showGhostEvents: parsed.showGhostEvents ?? false,
      selectedEventId: parsed.selectedEventId ?? null,
    };
  } catch {
    return { viewMode: "all", showGhostEvents: false, selectedEventId: null };
  }
}

function saveEditorUiState(state: EditorUiState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EDITOR_UI_KEY, JSON.stringify(state));
  } catch {
    // localStorage might be unavailable in private mode etc. — silently skip.
  }
}

export function EditorClient() {
  const [dance, setDance] = useState<DanceProject | null>(null);
  const [allDances, setAllDances] = useState<DanceProject[]>([]);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const [viewMode, setViewModeState] = useState<ViewMode>("all");
  const [showGhostEvents, setShowGhostEventsState] = useState(false);
  const [selectedEventId, setSelectedEventIdState] = useState<string | null>(null);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Load + migrate on first mount.
  useEffect(() => {
    let target: DanceProject | null = null;
    const currentId = getCurrentDanceId();
    if (currentId) target = getDance(currentId);
    if (!target) {
      const all = getAllDances();
      target = all[0] ?? null;
    }
    if (!target) {
      target = createEmptyDance();
      saveDance(target);
      setCurrentDanceId(target.id);
    } else {
      setCurrentDanceId(target.id);
    }
    const migrated = migrateStepsToTimelineEvents(target);
    if (migrated !== target) {
      // Persist the migration so subsequent loads skip the work.
      saveDance(migrated);
    }
    setDance(migrated);
    setAllDances(getAllDances());

    const ui = loadEditorUiState();
    setViewModeState(ui.viewMode);
    setShowGhostEventsState(ui.showGhostEvents);
    if (ui.selectedEventId && migrated.timelineEvents?.some((e) => e.id === ui.selectedEventId)) {
      setSelectedEventIdState(ui.selectedEventId);
    } else {
      setSelectedEventIdState(migrated.timelineEvents?.[0]?.id ?? null);
    }
  }, []);

  const persistUi = (next: Partial<EditorUiState>) => {
    saveEditorUiState({ viewMode, showGhostEvents, selectedEventId, ...next });
  };
  const setViewMode = (m: ViewMode) => {
    setViewModeState(m);
    persistUi({ viewMode: m });
  };
  const setShowGhostEvents = (b: boolean) => {
    setShowGhostEventsState(b);
    persistUi({ showGhostEvents: b });
  };
  const setSelectedEventId = (id: string | null) => {
    setSelectedEventIdState(id);
    persistUi({ selectedEventId: id });
  };

  const registryCustoms = typeof window === "undefined" ? [] : getAllCustomAnimations();
  const customAnimationsForUi = dance
    ? mergeCustomAnimations(dance.customAnimations, registryCustoms)
    : registryCustoms;

  const commitDance = (next: DanceProject) => {
    const merged = ensureReferencedCustomsAttached(next, registryCustoms);
    setDance(merged);
    saveDance(merged);
    setSavedAt(new Date());
    setAllDances(getAllDances());
  };

  // Playback loop — advances `currentBeat` based on BPM until the dance ends.
  useEffect(() => {
    if (!playing || !dance) return;
    const beatsPerMs = dance.bpm / 60000;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setCurrentBeat((prev) => {
        const next = prev + dt * beatsPerMs;
        const total = totalBeatsOf(dance);
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, dance]);

  const handleSwitchDance = (id: string) => {
    const target = getDance(id);
    if (!target) return;
    const migrated = migrateStepsToTimelineEvents(target);
    if (migrated !== target) saveDance(migrated);
    setDance(migrated);
    setCurrentDanceId(id);
    setSelectedEventId(migrated.timelineEvents?.[0]?.id ?? null);
    setCurrentBeat(0);
    setPlaying(false);
  };

  const handleNewDance = () => {
    const fresh = migrateStepsToTimelineEvents(createEmptyDance());
    saveDance(fresh);
    setCurrentDanceId(fresh.id);
    setDance(fresh);
    setAllDances(getAllDances());
    setSelectedEventId(fresh.timelineEvents?.[0]?.id ?? null);
    setCurrentBeat(0);
    setPlaying(false);
  };

  const handleSave = () => {
    if (!dance) return;
    saveDance(dance);
    setSavedAt(new Date());
    flash({ kind: "info", text: "Saved." });
  };

  const handleExport = () => {
    if (!dance) return;
    downloadFile(`${dance.name || "dance"}.json`, exportDanceToJson(dance));
  };

  const handleImport = async () => {
    const text = await pickJsonFile();
    if (text === null) return;
    try {
      const imported = importDanceFromJson(text);
      const migrated = migrateStepsToTimelineEvents(imported);
      saveDance(migrated);
      setCurrentDanceId(migrated.id);
      setDance(migrated);
      setAllDances(getAllDances());
      setSelectedEventId(migrated.timelineEvents?.[0]?.id ?? null);
      setCurrentBeat(0);
      flash({ kind: "info", text: `Imported "${migrated.name}".` });
    } catch (e) {
      flash({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleAddToArrangement = () => {
    if (!dance) return;
    const cmd = window.prompt("MQTT command (e.g. ON_OPENING):", "ON_OPENING");
    if (!cmd) return;
    addDanceToProgram(dance, cmd);
    flash({ kind: "info", text: `Added "${dance.name}" to arrangement as ${cmd}.` });
  };

  const flash = (n: Notice) => {
    setNotice(n);
    if (n) window.setTimeout(() => setNotice(null), 4000);
  };

  const updateEvent = (id: string, next: TimelineEvent) => {
    if (!dance) return;
    const events = dance.timelineEvents ?? [];
    commitDance({
      ...dance,
      timelineEvents: events.map((e) => (e.id === id ? next : e)),
    });
  };

  const deleteEvent = (id: string) => {
    if (!dance) return;
    const events = dance.timelineEvents ?? [];
    const next = events.filter((e) => e.id !== id);
    commitDance({ ...dance, timelineEvents: next });
    if (selectedEventId === id) setSelectedEventId(next[0]?.id ?? null);
  };

  const duplicateEvent = (id: string) => {
    if (!dance) return;
    const events = dance.timelineEvents ?? [];
    const idx = events.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const orig = events[idx]!;
    const clone: TimelineEvent = {
      ...orig,
      id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      startBeat: orig.startBeat + orig.durationBeats,
    };
    const next = [...events.slice(0, idx + 1), clone, ...events.slice(idx + 1)];
    commitDance({ ...dance, timelineEvents: next });
    setSelectedEventId(clone.id);
  };

  const handleAddEvent = () => {
    if (!dance) return;
    const events = dance.timelineEvents ?? [];
    const lastEnd = events.reduce((m, e) => Math.max(m, e.startBeat + e.durationBeats), 0);
    const dancerId = viewMode === "all" ? dance.dancers[0]?.id : viewMode.dancerId;
    const fresh = buildEmptyEvent(dance, {
      ...(dancerId !== undefined ? { dancerId } : {}),
      startBeat: lastEnd,
    });
    commitDance({ ...dance, timelineEvents: [...events, fresh] });
    setSelectedEventId(fresh.id);
  };

  const addSection = () => {
    if (!dance) return;
    const startBeat = totalBeatsOf(dance);
    const fresh = createEmptySection();
    commitDance({
      ...dance,
      sections: [...dance.sections, { ...fresh, startBeat, steps: [] }],
    });
  };

  const warnings = useMemo(
    () => (dance ? collectTimelineWarnings(dance) : []),
    [dance],
  );

  if (!dance) {
    return <div style={{ padding: 24 }} className="muted">Loading…</div>;
  }

  const selectedEvent =
    dance.timelineEvents?.find((e) => e.id === selectedEventId) ?? null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        flex: 1,
        minHeight: 0,
      }}
    >
      <header
        className="row"
        style={{
          padding: "10px 16px",
          background: "white",
          borderBottom: "1px solid #e2e8f0",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <strong>LED Dance Editor</strong>
        <span className="muted">·</span>
        <select value={dance.id} onChange={(e) => handleSwitchDance(e.target.value)}>
          {allDances.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <button onClick={handleNewDance}>+ New</button>
        <span className="spacer" />
        {savedAt && <span className="muted">Saved {savedAt.toLocaleTimeString()}</span>}
        <button className="primary" onClick={handleSave}>Save Dance</button>
        <button onClick={handleImport}>Import JSON</button>
        <button onClick={handleExport}>Export JSON</button>
        <button onClick={handleAddToArrangement}>Add to Arrangement</button>
      </header>

      {notice && (
        <div
          style={{ padding: "6px 16px" }}
          className={notice.kind === "error" ? "error" : "muted"}
        >
          {notice.text}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(420px, 540px)",
          gap: 12,
          padding: 12,
          overflow: "hidden",
        }}
      >
        <div className="col" style={{ gap: 12, overflow: "auto", paddingRight: 4 }}>
          <DanceMetaPanel dance={dance} onChange={commitDance} />

          <ViewModeTabs
            dancers={dance.dancers}
            mode={viewMode}
            onChange={setViewMode}
            showGhostEvents={showGhostEvents}
            onShowGhostEventsChange={setShowGhostEvents}
          />

          <div className="row" style={{ gap: 6 }}>
            <button
              className={playing ? "" : "primary"}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setCurrentBeat(0);
              }}
            >
              ↺ Reset
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              currentBeat: {currentBeat.toFixed(2)} / {totalBeatsOf(dance)}
            </span>
          </div>

          <TimelineEditor
            dance={dance}
            viewMode={viewMode}
            showGhostEvents={showGhostEvents}
            pxPerBeat={PX_PER_BEAT}
            selectedEventId={selectedEventId}
            currentBeat={currentBeat}
            onSelectEvent={setSelectedEventId}
            onAddEvent={handleAddEvent}
            onAddSection={addSection}
          />

          <TimelineWarningsPanel
            warnings={warnings}
            onSelectEvent={setSelectedEventId}
          />

          {selectedEvent && (
            <TimelineEventEditor
              event={selectedEvent}
              dance={dance}
              customAnimations={customAnimationsForUi}
              onChange={(next) => updateEvent(selectedEvent.id, next)}
              onDelete={() => deleteEvent(selectedEvent.id)}
              onDuplicate={() => duplicateEvent(selectedEvent.id)}
            />
          )}
        </div>

        <div style={{ overflow: "hidden" }}>
          <PreviewPanel
            dance={dance}
            currentBeat={currentBeat}
            selectedEventId={selectedEventId}
          />
        </div>
      </div>
    </div>
  );
}

function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function pickJsonFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const text = await file.text();
      resolve(text);
    };
    input.click();
  });
}
