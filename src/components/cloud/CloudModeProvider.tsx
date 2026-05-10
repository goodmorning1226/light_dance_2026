"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  CloudCustomAnimation,
  CloudDance,
  CloudExportSettings,
  CloudModeState,
  CloudProgramItem,
  CollaborationStatus,
  CustomAnimation,
  DanceProject,
  ExportSettings,
  ProgramArrangement,
  ProgramMember,
} from "@/types";
import { getSupabaseClient, isCloudConfigured } from "@/lib/supabase/client";
import { getCurrentAuthSession } from "@/lib/supabase/auth";
import {
  type CloudProgramSnapshot,
  createCloudProgram,
  joinProgramByShareCode,
  loadCloudProgram,
} from "@/lib/supabase/programs";
import {
  debounceSave,
  deleteCloudCustomAnimation,
  deleteCloudDance,
  flushDebouncedSaves,
  pushLocalSnapshotToCloud,
  saveCloudArrangement,
  saveCloudCustomAnimation,
  saveCloudDance,
  saveCloudExportSettings,
} from "@/lib/supabase/sync";
import {
  type RealtimeSubscription,
  subscribeToProgramRealtime,
} from "@/lib/supabase/realtime";
import {
  joinProgramPresence,
  type PresenceHandle,
  type PresencePayload,
  type PresenceState,
} from "@/lib/supabase/presence";
import {
  joinProgramBroadcast,
  type BroadcastEventName,
  type BroadcastHandle,
  type BroadcastMessage,
} from "@/lib/supabase/broadcast";
import { applyRealtimeEvent } from "@/lib/supabase/applyRealtime";
import { clearRecentSelfSaves } from "@/lib/supabase/recentSelfSaves";
import {
  clearCloudMirrorHooks,
  getAllCustomAnimations,
  getAllDances,
  getExportSettings,
  getProgram,
  setCloudMirrorHooks,
} from "@/lib/storage";

const CLOUD_SESSION_KEY = "ld26:cloud.activeProgramId";

// Per-table monotonic counters bumped whenever realtime applies a change.
// UI subscribes to these via useCloud() and re-reads from localStorage on
// change — no need for the cloud snapshot to be the source of truth in
// every component.
export interface CloudUpdateCounters {
  dances: number;
  programItems: number;
  customAnimations: number;
  exportSettings: number;
  members: number;
}

// Single editing-indicator broadcast payload. Sent when a user picks up
// (mousedown/focus) and again when they release (with `editing: false`).
export interface EditingBroadcastPayload {
  userId: string;
  displayName: string;
  danceId?: string | null;
  eventId?: string | null;
  sectionId?: string | null;
  editing: boolean;
}

// userId → most recent EditingBroadcastPayload. Stale entries (older than
// EDITING_TTL_MS without a refresh) are pruned by a timer.
export interface EditingState {
  [userId: string]: EditingBroadcastPayload & { receivedAt: number };
}
const EDITING_TTL_MS = 6_000;

interface CloudContextValue {
  // ===== Configuration =====
  cloudConfigured: boolean;

  // ===== Mode =====
  state: CloudModeState | null;          // null in Local Mode
  status: CollaborationStatus;
  errorMessage: string | null;
  lastSyncedAt: Date | null;

  // ===== Cached cloud snapshot =====
  // The latest data pulled from the server. UI components can read these
  // directly OR keep working off localStorage; the localStorage path is
  // mirrored back to cloud via the storage hook installed below.
  dances: CloudDance[];
  programItems: CloudProgramItem[];
  customAnimations: CloudCustomAnimation[];
  exportSettings: CloudExportSettings | null;

  // ===== Realtime change counters =====
  counters: CloudUpdateCounters;

  // ===== Presence =====
  presences: PresenceState;
  updateMyPresence: (next: Partial<PresencePayload>) => void;

  // ===== Broadcast (editing indicator) =====
  editing: EditingState;
  sendEditing: (payload: Omit<EditingBroadcastPayload, "userId" | "displayName">) => void;

  // ===== Entry / exit =====
  createProgram: (programName: string, displayName: string) => Promise<{ shareCode: string }>;
  joinProgram: (shareCode: string, displayName: string) => Promise<void>;
  leaveProgram: () => void;

  // ===== Manual operations =====
  reloadProgram: () => Promise<void>;
  pushLocalToCloud: () => Promise<void>;
}

const CloudContext = createContext<CloudContextValue | null>(null);

export function useCloud(): CloudContextValue {
  const ctx = useContext(CloudContext);
  if (!ctx) throw new Error("useCloud() must be called inside <CloudModeProvider>");
  return ctx;
}

const SAVE_DEBOUNCE_MS = 600;

export function CloudModeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CloudModeState | null>(null);
  const [snapshot, setSnapshot] = useState<CloudProgramSnapshot | null>(null);
  const [status, setStatus] = useState<CollaborationStatus>("local");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [counters, setCounters] = useState<CloudUpdateCounters>({
    dances: 0,
    programItems: 0,
    customAnimations: 0,
    exportSettings: 0,
    members: 0,
  });
  const [presences, setPresences] = useState<PresenceState>({});
  const [editing, setEditing] = useState<EditingState>({});

  // Mirror saves go through this ref so we don't recreate handlers on every
  // render of the provider (which would re-install the storage hook).
  const programIdRef = useRef<string | null>(null);
  const realtimeRef = useRef<RealtimeSubscription | null>(null);
  const presenceRef = useRef<PresenceHandle | null>(null);
  const broadcastRef = useRef<BroadcastHandle | null>(null);
  const stateRef = useRef<CloudModeState | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const cloudConfigured = isCloudConfigured();

  const flashSaved = useCallback(() => {
    setStatus("saved");
    setLastSyncedAt(new Date());
    window.setTimeout(() => {
      // Only revert if no other operation has updated status meanwhile.
      setStatus((s) => (s === "saved" ? "connected" : s));
    }, 1500);
  }, []);

  const reportError = useCallback((message: string) => {
    setErrorMessage(message);
    setStatus("error");
    console.error("[Cloud]", message);
  }, []);

  // Run a save against cloud, with status transitions and error capture.
  const runSave = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      if (!programIdRef.current) return;
      setStatus("saving");
      try {
        await fn();
        flashSaved();
      } catch (e) {
        reportError(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [flashSaved, reportError],
  );

  const bumpCounter = useCallback((kind: keyof CloudUpdateCounters) => {
    setCounters((prev) => ({ ...prev, [kind]: prev[kind] + 1 }));
  }, []);

  const refreshMembers = useCallback(async () => {
    const pid = programIdRef.current;
    if (!pid) return;
    try {
      const snap = await loadCloudProgram(pid);
      setSnapshot(snap);
      setState((prev) =>
        prev ? { ...prev, program: snap.program, members: snap.members } : prev,
      );
      bumpCounter("members");
    } catch (e) {
      console.warn("[Cloud] refreshMembers failed:", e);
    }
  }, [bumpCounter]);

  const refreshArrangementFromCloud = useCallback(async () => {
    const pid = programIdRef.current;
    if (!pid) return;
    try {
      const snap = await loadCloudProgram(pid);
      setSnapshot(snap);
      bumpCounter("programItems");
    } catch (e) {
      console.warn("[Cloud] refreshArrangement failed:", e);
    }
  }, [bumpCounter]);

  // Install / remove the storage mirror hooks whenever cloud session changes.
  // Saves are debounced per (table, id) — typing into a name field, dragging
  // an event, etc. all stay below the 600ms hairtrigger so we don't pummel
  // Supabase with a write per keystroke.
  useEffect(() => {
    if (!state) {
      clearCloudMirrorHooks();
      programIdRef.current = null;
      return;
    }
    programIdRef.current = state.program.id;
    const pid = state.program.id;

    setCloudMirrorHooks({
      onDanceSaved: (dance: DanceProject) => {
        debounceSave(`dance:${dance.id}`, SAVE_DEBOUNCE_MS, () =>
          runSave("save dance", () => saveCloudDance(pid, dance)),
        );
      },
      onDanceDeleted: (id: string) => {
        // Deletes are not debounced — there's no value in coalescing a
        // delete with a later save of a re-created entity. Run immediately.
        void runSave("delete dance", () => deleteCloudDance(pid, id));
      },
      onProgramSaved: (program: ProgramArrangement) => {
        debounceSave(`arrangement:${pid}`, SAVE_DEBOUNCE_MS, () =>
          runSave("save arrangement", () => saveCloudArrangement(pid, program)),
        );
      },
      onCustomAnimationSaved: (animation: CustomAnimation) => {
        debounceSave(`customAnim:${animation.id}`, SAVE_DEBOUNCE_MS, () =>
          runSave("save custom animation", () => saveCloudCustomAnimation(pid, animation)),
        );
      },
      onCustomAnimationDeleted: (id: string) => {
        void runSave("delete custom animation", () => deleteCloudCustomAnimation(pid, id));
      },
      onExportSettingsSaved: (settings: ExportSettings) => {
        debounceSave(`exportSettings:${pid}`, SAVE_DEBOUNCE_MS, () =>
          runSave("save export settings", () => saveCloudExportSettings(pid, settings)),
        );
      },
    });

    return () => {
      // Make sure pending debounced writes are flushed BEFORE hooks are
      // removed; otherwise a queued upsert would silently drop.
      void flushDebouncedSaves();
      clearCloudMirrorHooks();
    };
  }, [state, runSave]);

  // ===== Realtime / presence / broadcast lifecycle =====
  // Setup is async because StrictMode in dev double-mounts the effect:
  // the first mount's cleanup dispatches an async unsubscribe (fire and
  // forget) and the second mount runs immediately. If we synchronously
  // call supabase.channel(topic) again in mount 2, the still-`joined`
  // channel from mount 1 may be returned and `channel.on('presence', ...)`
  // throws "cannot add callbacks after subscribe()". Awaiting
  // removeChannel for any stale topics before re-subscribing fixes it.
  useEffect(() => {
    if (!state) return;
    const pid = state.program.id;

    let cancelled = false;
    let rtHandle: RealtimeSubscription | null = null;
    let presHandle: PresenceHandle | null = null;
    let bcHandle: BroadcastHandle | null = null;

    const setup = async () => {
      const supabase = getSupabaseClient();
      const expectedTopics = [
        `realtime:program:${pid}`,
        `realtime:presence:${pid}`,
        `realtime:broadcast:${pid}`,
      ];
      const stale = supabase
        .getChannels()
        .filter((ch) => expectedTopics.includes(ch.topic));
      if (stale.length > 0) {
        await Promise.all(stale.map((ch) => supabase.removeChannel(ch)));
      }
      if (cancelled) return;

      rtHandle = subscribeToProgramRealtime({
        programId: pid,
        onEvent: (event) => {
          const applied = applyRealtimeEvent(pid, event);
          if (!applied) return;
          switch (applied.kind) {
            case "dances":
              bumpCounter("dances");
              break;
            case "program_items":
              // The single-row event isn't enough to rebuild the new
              // order locally — pull the table once.
              void refreshArrangementFromCloud();
              break;
            case "custom_animations":
              bumpCounter("customAnimations");
              break;
            case "export_settings":
              bumpCounter("exportSettings");
              break;
            case "program_members":
              void refreshMembers();
              break;
          }
          setLastSyncedAt(new Date());
        },
        onStatus: (s) => {
          if (s.state === "channel_error" || s.state === "timed_out") {
            reportError(`realtime: ${s.reason ?? s.state}`);
          }
        },
      });

      presHandle = joinProgramPresence({
        programId: pid,
        initial: {
          userId: state.myUserId,
          displayName: state.myDisplayName,
          joinedAt: Date.now(),
        },
        onSync: (next) => setPresences(next),
      });

      bcHandle = joinProgramBroadcast({
        programId: pid,
        onMessage: (msg: BroadcastMessage) => {
          if (msg.event !== ("editing" satisfies BroadcastEventName)) return;
          const payload = msg.payload as EditingBroadcastPayload;
          if (!payload || !payload.userId) return;
          // Drop our own echoes (broadcast self:false should already, but
          // belt-and-braces — different tabs of the same userId still echo).
          if (payload.userId === stateRef.current?.myUserId) return;
          setEditing((prev) => ({
            ...prev,
            [payload.userId]: { ...payload, receivedAt: Date.now() },
          }));
        },
      });

      realtimeRef.current = rtHandle;
      presenceRef.current = presHandle;
      broadcastRef.current = bcHandle;
    };

    void setup().catch((e) => {
      reportError(`realtime setup: ${e instanceof Error ? e.message : String(e)}`);
    });

    return () => {
      cancelled = true;
      // Local vars (not refs) so we capture handles created inside the
      // async setup even if cleanup runs before setup() finishes
      // assigning to refs.
      void rtHandle?.unsubscribe();
      void presHandle?.unsubscribe();
      void bcHandle?.unsubscribe();
      realtimeRef.current = null;
      presenceRef.current = null;
      broadcastRef.current = null;
      // Wipe self-save tracker so a fresh session doesn't ignore real
      // changes from other clients that happen to share a recent uuid.
      clearRecentSelfSaves();
    };
  }, [state, bumpCounter, refreshArrangementFromCloud, refreshMembers, reportError]);

  // Periodically prune editing entries that haven't been refreshed.
  useEffect(() => {
    if (!state) return;
    const handle = window.setInterval(() => {
      const now = Date.now();
      setEditing((prev) => {
        const next: EditingState = {};
        let changed = false;
        for (const [uid, entry] of Object.entries(prev)) {
          if (now - entry.receivedAt < EDITING_TTL_MS) {
            next[uid] = entry;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1500);
    return () => window.clearInterval(handle);
  }, [state]);

  // Try to restore a cloud session on first mount: if Supabase is configured
  // AND the user previously joined a program AND a session is still valid,
  // re-enter Cloud Mode automatically.
  useEffect(() => {
    if (!cloudConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = await getCurrentAuthSession();
        if (!auth) return;
        const savedId = window.localStorage.getItem(CLOUD_SESSION_KEY);
        if (!savedId) return;
        setStatus("connecting");
        const snap = await loadCloudProgram(savedId);
        if (cancelled) return;
        const me = snap.members.find((m) => m.userId === auth.userId);
        if (!me) {
          // Lost membership in the meantime — fall back to local.
          window.localStorage.removeItem(CLOUD_SESSION_KEY);
          setStatus("local");
          return;
        }
        setSnapshot(snap);
        setState({
          program: snap.program,
          members: snap.members,
          myUserId: auth.userId,
          myDisplayName: me.displayName,
          myRole: me.role,
        });
        setStatus("connected");
        setLastSyncedAt(new Date());
      } catch (e) {
        if (!cancelled) {
          reportError(`reconnect: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloudConfigured, reportError]);

  const enterProgram = useCallback(
    async (programId: string, displayName: string) => {
      setStatus("connecting");
      const snap = await loadCloudProgram(programId);
      const auth = await getCurrentAuthSession();
      if (!auth) throw new Error("Not signed in after RPC — should not happen");
      const me = snap.members.find((m) => m.userId === auth.userId);
      if (!me) throw new Error("Joined program but membership row not visible — RLS issue?");
      setSnapshot(snap);
      setState({
        program: snap.program,
        members: snap.members,
        myUserId: auth.userId,
        myDisplayName: displayName.trim() || me.displayName,
        myRole: me.role,
      });
      setStatus("connected");
      setLastSyncedAt(new Date());
      try {
        window.localStorage.setItem(CLOUD_SESSION_KEY, programId);
      } catch {
        // localStorage might be unavailable (private mode); session reconnect
        // will simply not auto-resume. Non-fatal.
      }
    },
    [],
  );

  const createProgram = useCallback(
    async (programName: string, displayName: string) => {
      try {
        const { programId, shareCode } = await createCloudProgram(programName, displayName);
        await enterProgram(programId, displayName);
        // Push whatever the user already had locally up to the new cloud
        // program so they don't lose their work.
        try {
          await pushLocalSnapshotToCloud(programId, {
            dances: getAllDances(),
            arrangement: getProgram(),
            customAnimations: getAllCustomAnimations(),
            exportSettings: getExportSettings(),
          });
          setLastSyncedAt(new Date());
        } catch (e) {
          reportError(
            `initial upload: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        return { shareCode };
      } catch (e) {
        reportError(`createProgram: ${e instanceof Error ? e.message : String(e)}`);
        throw e;
      }
    },
    [enterProgram, reportError],
  );

  const joinProgram = useCallback(
    async (shareCode: string, displayName: string) => {
      try {
        const { programId } = await joinProgramByShareCode(shareCode, displayName);
        await enterProgram(programId, displayName);
      } catch (e) {
        reportError(`joinProgram: ${e instanceof Error ? e.message : String(e)}`);
        throw e;
      }
    },
    [enterProgram, reportError],
  );

  const leaveProgram = useCallback(() => {
    setState(null);
    setSnapshot(null);
    setStatus("local");
    setErrorMessage(null);
    setPresences({});
    setEditing({});
    try {
      window.localStorage.removeItem(CLOUD_SESSION_KEY);
    } catch {
      // ignore
    }
  }, []);

  const reloadProgram = useCallback(async () => {
    if (!state) return;
    setStatus("connecting");
    try {
      const snap = await loadCloudProgram(state.program.id);
      setSnapshot(snap);
      setState((prev) =>
        prev ? { ...prev, program: snap.program, members: snap.members } : prev,
      );
      setStatus("connected");
      setLastSyncedAt(new Date());
    } catch (e) {
      reportError(`reload: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [state, reportError]);

  const pushLocalToCloud = useCallback(async () => {
    if (!state) return;
    setStatus("saving");
    try {
      await pushLocalSnapshotToCloud(state.program.id, {
        dances: getAllDances(),
        arrangement: getProgram(),
        customAnimations: getAllCustomAnimations(),
        exportSettings: getExportSettings(),
      });
      flashSaved();
    } catch (e) {
      reportError(`push: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [state, flashSaved, reportError]);

  const updateMyPresence = useCallback((next: Partial<PresencePayload>) => {
    void presenceRef.current?.update(next);
  }, []);

  const sendEditing = useCallback(
    (payload: Omit<EditingBroadcastPayload, "userId" | "displayName">) => {
      const s = stateRef.current;
      if (!s) return;
      const full: EditingBroadcastPayload = {
        userId: s.myUserId,
        displayName: s.myDisplayName,
        ...payload,
      };
      void broadcastRef.current?.send("editing", full);
    },
    [],
  );

  const value = useMemo<CloudContextValue>(
    () => ({
      cloudConfigured,
      state,
      status,
      errorMessage,
      lastSyncedAt,
      dances: snapshot?.dances ?? [],
      programItems: snapshot?.programItems ?? [],
      customAnimations: snapshot?.customAnimations ?? [],
      exportSettings: snapshot?.exportSettings ?? null,
      counters,
      presences,
      updateMyPresence,
      editing,
      sendEditing,
      createProgram,
      joinProgram,
      leaveProgram,
      reloadProgram,
      pushLocalToCloud,
    }),
    [
      cloudConfigured,
      state,
      status,
      errorMessage,
      lastSyncedAt,
      snapshot,
      counters,
      presences,
      updateMyPresence,
      editing,
      sendEditing,
      createProgram,
      joinProgram,
      leaveProgram,
      reloadProgram,
      pushLocalToCloud,
    ],
  );

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}

// Helper for components that just want the current member list.
export function useProgramMembers(): ProgramMember[] {
  const { state } = useCloud();
  return state?.members ?? [];
}
