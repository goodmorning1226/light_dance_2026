"use client";

import { useEffect, useMemo, useState } from "react";
import type { DanceProject, TimelineEvent } from "@/types";
import {
  addDanceToProgram,
  deleteDance,
  getAllCustomAnimations,
  getAllDances,
  getCurrentDanceId,
  getDance,
  saveDance,
  setCurrentDanceId,
  setDanceOrigin,
} from "@/lib/storage";
import { useCloud } from "@/components/cloud/CloudModeProvider";
import { getCloudId } from "@/lib/supabase/cloudIdMap";
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
  snapBeat,
  totalBeatsOf,
} from "@/lib/editor/timelineHelpers";
import { DanceMetaPanel } from "./DanceMetaPanel";
import { PreviewPanel } from "./PreviewPanel";
import { TimelineEditor } from "./TimelineEditor";
import { TimelineEventEditor } from "./TimelineEventEditor";
import { TimelineWarningsPanel } from "./TimelineWarningsPanel";
import { ViewModeTabs, type ViewMode } from "./ViewModeTabs";
import { EventModal } from "./EventModal";

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
    const parsed = JSON.parse(raw) as Partial<EditorUiState> & {
      viewMode?: ViewMode | { dancerId: number };
    };
    // Migrate legacy single-dancer viewMode shape `{ dancerId: N }` into the
    // current multi-select shape `{ dancerIds: [N] }`.
    let viewMode: ViewMode = "all";
    const v = parsed.viewMode;
    if (v === "all") viewMode = "all";
    else if (v && typeof v === "object" && "dancerIds" in v && Array.isArray(v.dancerIds)) {
      viewMode = { dancerIds: v.dancerIds.filter((x): x is number => typeof x === "number") };
    } else if (v && typeof v === "object" && "dancerId" in v && typeof v.dancerId === "number") {
      viewMode = { dancerIds: [v.dancerId] };
    }
    return {
      viewMode,
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
  const cloud = useCloud();

  const [dance, setDance] = useState<DanceProject | null>(null);
  const [allDances, setAllDances] = useState<DanceProject[]>([]);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const [viewMode, setViewModeState] = useState<ViewMode>("all");
  const [showGhostEvents, setShowGhostEventsState] = useState(false);
  const [selectedEventId, setSelectedEventIdState] = useState<string | null>(null);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Controlled value for the "Jump to section…" select. Persisted only in
  // memory: we want the select to keep showing the chosen section name after
  // the user picks one, but it should reset when the playhead moves elsewhere
  // (Play / Reset / direct ruler-click) so it doesn't lie about state.
  const [jumpedSectionId, setJumpedSectionId] = useState<string>("");

  // Event modal — used for both personal (lockedDancerId set) and common
  // (lockedDancerId undefined) creation flows. The playhead position and
  // the dancer list are frozen at open time so the modal is stable while the
  // user authors the event.
  const [eventModal, setEventModal] = useState<{
    open: boolean;
    startBeat: number;
    defaultDancerIds: number[];
    lockedDancerId?: number;
  }>({ open: false, startBeat: 0, defaultDancerIds: [] });

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

  // Re-read from localStorage when realtime (or leaveProgram) announces a
  // dance change. The cloud-sync layer applies incoming rows via the SAME
  // storage helpers (with mirror hooks suppressed), so by the time this
  // counter ticks the source of truth is already updated — we just refresh
  // local React state. Three cases:
  //   1. Current dance still exists → just refresh its content.
  //   2. Current dance was removed (e.g. leaveProgram evicted all cloud
  //      dances) but other dances remain → switch to the first one.
  //   3. No dances remain → seed a fresh local-only empty so the editor
  //      doesn't get stuck on a null dance.
  const danceCounter = cloud.counters.dances;
  useEffect(() => {
    if (danceCounter === 0) return;
    const all = getAllDances();
    setAllDances(all);
    if (all.length === 0) {
      const fresh = migrateStepsToTimelineEvents(createEmptyDance());
      setDanceOrigin(fresh.id, "local-only");
      saveDance(fresh);
      setCurrentDanceId(fresh.id);
      setDance(fresh);
      setAllDances([fresh]);
      setSelectedEventIdState(fresh.timelineEvents?.[0]?.id ?? null);
      setCurrentBeat(0);
      setPlaying(false);
      return;
    }
    setDance((prev) => {
      if (!prev) {
        const next = all[0]!;
        setCurrentDanceId(next.id);
        setSelectedEventIdState(next.timelineEvents?.[0]?.id ?? null);
        setCurrentBeat(0);
        setPlaying(false);
        return next;
      }
      const fresh = all.find((d) => d.id === prev.id);
      if (fresh) return fresh;
      // Current dance vanished from storage — switch to the first remaining.
      const next = all[0]!;
      setCurrentDanceId(next.id);
      setSelectedEventIdState(next.timelineEvents?.[0]?.id ?? null);
      setCurrentBeat(0);
      setPlaying(false);
      return next;
    });
  }, [danceCounter]);

  // Pull stable callbacks out so we can depend on THEM (they're useCallback
  // with empty deps inside the provider) rather than the whole `cloud`
  // object — which gets a fresh reference on every counter bump or
  // presence sync. Depending on `cloud` would re-fire the editing effect
  // constantly, sending false→true bursts that show up as a flicker on
  // the other clients' indicator border.
  const { updateMyPresence, sendEditing } = cloud;
  const inCloud = cloud.state !== null;

  // Publish presence: which dance / event / view we're currently looking at.
  // `dancerTab` is a single int for backward-compat with consumers (e.g.
  // MembersPanel); when multiple dancers are selected we surface the lowest
  // id, and -1 means "all".
  useEffect(() => {
    if (!inCloud) return;
    const dancerTab =
      viewMode === "all"
        ? -1
        : viewMode.dancerIds[0] !== undefined
          ? viewMode.dancerIds[0]
          : -1;
    updateMyPresence({
      currentDanceId: dance?.id,
      currentEventId: selectedEventId ?? undefined,
      currentView: "editor",
      dancerTab,
    });
  }, [inCloud, updateMyPresence, dance?.id, selectedEventId, viewMode]);

  // Broadcast editing-indicator transitions: every time the selection
  // changes, claim the new event and release the previous one. The TTL on
  // the receiving side prunes stale entries even if a "release" message is
  // dropped in transit.
  useEffect(() => {
    if (!inCloud) return;
    if (selectedEventId) {
      sendEditing({
        danceId: dance?.id ?? null,
        eventId: selectedEventId,
        sectionId: null,
        editing: true,
      });
    }
    return () => {
      if (selectedEventId) {
        sendEditing({
          danceId: dance?.id ?? null,
          eventId: selectedEventId,
          sectionId: null,
          editing: false,
        });
      }
    };
  }, [inCloud, sendEditing, selectedEventId, dance?.id]);

  // Build a per-event display-name map from incoming editing broadcasts.
  const editorsByEventId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of Object.values(cloud.editing)) {
      if (!entry.editing || !entry.eventId) continue;
      // Only show editors who are on the same dance the user is viewing.
      if (entry.danceId && dance?.id && entry.danceId !== dance.id) continue;
      map[entry.eventId] = entry.displayName;
    }
    return map;
  }, [cloud.editing, dance?.id]);

  // Split the dance list into "cloud-synced for the active program" vs
  // "this-browser-only" so the user can immediately tell which dances
  // their teammates can see. The check is `cloudIdMap` membership: a
  // local dance.id present in the map is mirrored to a cloud row, anything
  // else is local-only (either created before joining the program, or
  // simply never pushed). Recomputed on counter bumps because realtime
  // INSERTs add new mappings.
  const activeProgramId = cloud.state?.program.id ?? null;
  // lastSyncedAt re-flips the flags after our OWN save completes — the
  // cloud-id mapping is created synchronously inside saveCloudDance, but
  // only React state changes can trigger a re-render. The realtime echo
  // would also do it, except recordSelfSave swallows our own echoes.
  const lastSyncedAt = cloud.lastSyncedAt;
  const danceCloudFlags = useMemo(() => {
    const flags: Record<string, boolean> = {};
    if (!activeProgramId) return flags;
    for (const d of allDances) {
      flags[d.id] = getCloudId(activeProgramId, "dances", d.id) !== null;
    }
    return flags;
    // danceCounter handles other-client changes; lastSyncedAt handles ours.
  }, [allDances, activeProgramId, danceCounter, lastSyncedAt]);
  const currentDanceIsCloud = dance ? !!danceCloudFlags[dance.id] : false;
  const { cloudDances, localOnlyDances } = useMemo(() => {
    if (!activeProgramId) {
      return { cloudDances: [] as DanceProject[], localOnlyDances: allDances };
    }
    const cloudList: DanceProject[] = [];
    const localList: DanceProject[] = [];
    for (const d of allDances) {
      (danceCloudFlags[d.id] ? cloudList : localList).push(d);
    }
    return { cloudDances: cloudList, localOnlyDances: localList };
  }, [allDances, activeProgramId, danceCloudFlags]);

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

  // Create a fresh dance. `origin` controls whether the cloud-mirror hook
  // pushes it on save:
  //   - "local-only" → never sync (private draft)
  //   - "cloud-mine" → mirror to cloud immediately (shared with teammates)
  //   - null         → unmarked; behaves as cloud-mine if a cloud session
  //                    is later joined (default for local-mode users)
  // Set origin BEFORE saveDance so the mirror hook sees the correct flag
  // synchronously when it fires.
  const handleNewDance = (origin: "local-only" | "cloud-mine" | null) => {
    const fresh = migrateStepsToTimelineEvents(createEmptyDance());
    if (origin !== null) setDanceOrigin(fresh.id, origin);
    saveDance(fresh);
    setCurrentDanceId(fresh.id);
    setDance(fresh);
    setAllDances(getAllDances());
    setSelectedEventId(fresh.timelineEvents?.[0]?.id ?? null);
    setCurrentBeat(0);
    setPlaying(false);
    flash({
      kind: "info",
      text:
        origin === "local-only"
          ? "Created a local-only dance (won't sync to cloud)."
          : origin === "cloud-mine"
            ? "Created a cloud dance — visible to teammates."
            : "Created a new dance.",
    });
  };

  // Delete the current dance. Cloud sync fires automatically through the
  // storage hook (suppressed for local-only dances since they have no cloud
  // row). If this was the last remaining dance, auto-create a fresh
  // local-only empty so the editor doesn't end up in an unloadable state.
  const handleDeleteDance = () => {
    if (!dance) return;
    const idToDelete = dance.id;
    const name = dance.name;
    if (!window.confirm(`Delete dance "${name}"? This cannot be undone.`)) return;
    const remaining = getAllDances().filter((d) => d.id !== idToDelete);
    deleteDance(idToDelete);
    setAllDances(remaining);
    if (remaining[0]) {
      handleSwitchDance(remaining[0].id);
      flash({ kind: "info", text: `Deleted "${name}".` });
    } else {
      // No dances left — seed a blank local-only one so the editor has
      // something to render. The user can promote / push later if they want.
      handleNewDance("local-only");
    }
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

  // Move the playhead. Used by the BeatRuler (click + drag), the manual
  // input box, and Reset. Always pauses playback so dragging doesn't fight
  // the requestAnimationFrame loop. Resets the jump-to-section dropdown
  // because the playhead is no longer "at" that section.
  const handleSeek = (beat: number) => {
    if (!dance) return;
    if (playing) setPlaying(false);
    const snapped = Math.max(0, snapBeat(beat, dance.beatUnit));
    setCurrentBeat(snapped);
    setJumpedSectionId("");
  };

  // Personal event entry point — opens the event modal locked to one
  // dancer. The modal handles authoring (duration, clearBefore, label,
  // actions) and runs the overlap check against the user-chosen duration on
  // Apply, so a tight gap can be filled by shrinking the duration.
  const handleAddPersonalEvent = (dancerId: number) => {
    if (!dance) return;
    setEventModal({
      open: true,
      startBeat: snapBeat(currentBeat, dance.beatUnit),
      defaultDancerIds: [dancerId],
      lockedDancerId: dancerId,
    });
  };

  // Common event entry point — opens the event modal in multi-dancer mode.
  // Pre-fills with the dancers visible in the current ViewMode.
  const openCommonEventModal = () => {
    if (!dance) return;
    const startBeat = snapBeat(currentBeat, dance.beatUnit);
    const visible =
      viewMode === "all"
        ? dance.dancers.map((d) => d.id)
        : viewMode.dancerIds.filter((id) => dance.dancers.some((d) => d.id === id));
    setEventModal({
      open: true,
      startBeat,
      defaultDancerIds: visible.length > 0 ? visible : dance.dancers.map((d) => d.id),
    });
  };

  // Modal Apply callback: receives a list of fully-formed personal events
  // (already overlap-checked inside the modal). Append + select the first.
  const handleApplyEventModal = (newEvents: TimelineEvent[]) => {
    if (!dance) return;
    if (newEvents.length === 0) {
      setEventModal((prev) => ({ ...prev, open: false }));
      return;
    }
    const events = dance.timelineEvents ?? [];
    commitDance({ ...dance, timelineEvents: [...events, ...newEvents] });
    setSelectedEventId(newEvents[0]!.id);
    setEventModal((prev) => ({ ...prev, open: false }));
  };

  // Section: drops a marker at the current playhead. No prompt for a beat —
  // sections are pure ruler markers now, and the visual playhead is the
  // location indicator.
  const addSection = () => {
    if (!dance) return;
    const startBeat = snapBeat(currentBeat, dance.beatUnit);
    const name = window.prompt(`Section name (at beat ${startBeat}):`, "New Section");
    if (name === null || name.trim() === "") return;
    const fresh = createEmptySection(name.trim());
    const sections = [
      ...dance.sections,
      { ...fresh, startBeat, steps: [] },
    ].sort((a, b) => (a.startBeat ?? 0) - (b.startBeat ?? 0));
    commitDance({ ...dance, sections });
  };

  // Jump-to-section dropdown. Stays selected on the chosen section so the
  // user can see where they last jumped to; handleSeek clears it again as
  // soon as the playhead moves elsewhere.
  const handleJumpToSection = (sectionId: string) => {
    if (!dance) return;
    if (sectionId === "") return;
    const s = dance.sections.find((x) => x.id === sectionId);
    if (!s) return;
    setPlaying(false);
    setCurrentBeat(snapBeat(s.startBeat ?? 0, dance.beatUnit));
    setJumpedSectionId(sectionId);
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
          {activeProgramId ? (
            <>
              <optgroup label={`☁  Cloud · ${cloud.state?.program.name ?? ""}`}>
                {cloudDances.map((d) => (
                  <option key={d.id} value={d.id}>☁ {d.name}</option>
                ))}
                {cloudDances.length === 0 && (
                  <option disabled value="">(no cloud dances yet)</option>
                )}
              </optgroup>
              <optgroup label="💻  Local only (this browser)">
                {localOnlyDances.map((d) => (
                  <option key={d.id} value={d.id}>💻 {d.name}</option>
                ))}
                {localOnlyDances.length === 0 && (
                  <option disabled value="">(none)</option>
                )}
              </optgroup>
            </>
          ) : (
            allDances.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))
          )}
        </select>
        {activeProgramId && (
          <span
            title={
              currentDanceIsCloud
                ? "This dance is mirrored to the cloud — your edits sync to teammates."
                : "This dance lives only in this browser. Click Push local on the cloud bar to share it."
            }
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              border: "1px solid",
              background: currentDanceIsCloud ? "#dcfce7" : "#fef3c7",
              borderColor: currentDanceIsCloud ? "#16a34a" : "#d97706",
              color: currentDanceIsCloud ? "#166534" : "#92400e",
            }}
          >
            {currentDanceIsCloud ? "☁ Cloud" : "💻 Local only"}
          </span>
        )}
        {activeProgramId ? (
          <>
            <button
              onClick={() => handleNewDance("local-only")}
              title="Create a private dance that stays in this browser"
            >
              + Local
            </button>
            <button
              className="primary"
              onClick={() => handleNewDance("cloud-mine")}
              title="Create a dance shared with this program's members"
            >
              + Cloud
            </button>
          </>
        ) : (
          <button onClick={() => handleNewDance(null)}>+ New</button>
        )}
        <button
          className="danger"
          onClick={handleDeleteDance}
          title={`Delete "${dance.name}"`}
          disabled={!dance}
        >
          🗑 Delete
        </button>
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

          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
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
                setJumpedSectionId("");
              }}
            >
              ↺ Reset
            </button>
            <label className="row" style={{ gap: 4, fontSize: 12 }}>
              <span className="group-label">Beat</span>
              <input
                type="number"
                min={0}
                step={dance.beatUnit}
                value={currentBeat}
                onChange={(e) => handleSeek(Number(e.target.value))}
                style={{ width: 80 }}
                title="Move the playhead by typing a beat number"
              />
              <span className="muted" style={{ fontSize: 11 }}>
                / {totalBeatsOf(dance)}
              </span>
            </label>
            {dance.sections.length > 0 && (
              <label className="row" style={{ gap: 4, fontSize: 12 }}>
                <span className="group-label">Jump to</span>
                <select
                  value={jumpedSectionId}
                  onChange={(e) => handleJumpToSection(e.target.value)}
                  title="Move the playhead to the start of a section"
                >
                  <option value="">section…</option>
                  {[...dance.sections]
                    .sort((a, b) => (a.startBeat ?? 0) - (b.startBeat ?? 0))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (beat {s.startBeat ?? 0})
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>

          <TimelineEditor
            dance={dance}
            viewMode={viewMode}
            showGhostEvents={showGhostEvents}
            pxPerBeat={PX_PER_BEAT}
            selectedEventId={selectedEventId}
            currentBeat={currentBeat}
            editorsByEventId={editorsByEventId}
            onSelectEvent={setSelectedEventId}
            onSeek={handleSeek}
            onAddPersonalEvent={handleAddPersonalEvent}
            onOpenCommonEventModal={openCommonEventModal}
            onAddSection={addSection}
          />

          <EventModal
            isOpen={eventModal.open}
            dance={dance}
            customAnimations={customAnimationsForUi}
            startBeat={eventModal.startBeat}
            defaultDancerIds={eventModal.defaultDancerIds}
            {...(eventModal.lockedDancerId !== undefined
              ? { lockedDancerId: eventModal.lockedDancerId }
              : {})}
            onApply={handleApplyEventModal}
            onCancel={() => setEventModal((prev) => ({ ...prev, open: false }))}
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
