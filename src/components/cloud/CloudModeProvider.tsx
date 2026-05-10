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
  cancelDebouncedSave,
  debounceSave,
  deleteCloudCustomAnimation,
  deleteCloudDance,
  flushDebouncedSaves,
  saveCloudArrangement,
  saveCloudCustomAnimation,
  saveCloudDance,
  saveCloudExportSettings,
} from "@/lib/supabase/sync";
import { clearCloudIdMap } from "@/lib/supabase/cloudIdMap";
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
  deleteDance,
  getAllDances,
  getDanceOrigin,
  isLocalOnlyDance,
  saveCustomAnimation,
  saveDance,
  setCloudMirrorHooks,
  setDanceOrigin,
  withSuppressedHooks,
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
        // Local-only dances never sync to cloud, no matter what triggered
        // the save. The origin flag is set when the user picks "+ New
        // (Local)" or pre-existing dances are marked at enter time.
        if (isLocalOnlyDance(dance.id)) return;
        debounceSave(`dance:${dance.id}`, SAVE_DEBOUNCE_MS, () =>
          runSave("save dance", () => saveCloudDance(pid, dance)),
        );
      },
      onDanceDeleted: (id: string) => {
        // CRUCIAL: kill any pending debounced save before the delete goes
        // out. Without this, a "+ Cloud → quickly delete" sequence races —
        // the save fires after the delete and resurrects the row on cloud,
        // which then re-appears next time the user joins the program.
        cancelDebouncedSave(`dance:${id}`);
        // No cloud row exists for a local-only dance — skip the round-trip.
        // This hook fires before storage clears the origin record (see
        // dances.ts) so isLocalOnlyDance still returns the correct answer.
        if (isLocalOnlyDance(id)) return;
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
        // Same race as dances — cancel any in-flight debounced save first.
        cancelDebouncedSave(`customAnim:${id}`);
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
      // Snapshot pre-existing local dance ids BEFORE we mirror cloud rows
      // down. Anything still on this list after the cloud sync that DOESN'T
      // appear in the cloud snapshot is a private local draft → flag it as
      // local-only so the mirror hook leaves it alone going forward.
      const preExistingLocalIds = new Set(getAllDances().map((d) => d.id));

      const snap = await loadCloudProgram(programId);
      const auth = await getCurrentAuthSession();
      if (!auth) throw new Error("Not signed in after RPC — should not happen");
      const me = snap.members.find((m) => m.userId === auth.userId);
      if (!me) throw new Error("Joined program but membership row not visible — RLS issue?");

      // Mirror cloud dances + custom animations into localStorage BEFORE we
      // flip status to "connected", so the moment the editor sees the new
      // state it can also read the cloud content via getAllDances() /
      // getAllCustomAnimations(). Without this the user sees an empty cloud
      // section right after Join and only a manual page refresh fills it
      // in (because EditorClient's mount-time read happens before
      // enterProgram's localStorage writes).
      //
      // Origin classification for dances:
      //   - local id was already present  → "cloud-mine" (round-trip)
      //   - local id was NOT present      → "cloud-imported" (teammate's,
      //     gets cleaned up on leave)
      const cloudLocalIds = new Set<string>();
      withSuppressedHooks(() => {
        for (const cloudDance of snap.dances) {
          const localId = cloudDance.danceJson.id;
          cloudLocalIds.add(localId);
          saveDance(cloudDance.danceJson);
          setDanceOrigin(
            localId,
            preExistingLocalIds.has(localId) ? "cloud-mine" : "cloud-imported",
          );
        }
        for (const cloudCustom of snap.customAnimations) {
          saveCustomAnimation(cloudCustom.animationJson);
        }
      });

      // Pre-existing local dances that DIDN'T match a cloud row are private
      // drafts. Mark them local-only so the mirror won't push them on the
      // next save (this is what fixes the "default new dance gets pushed
      // automatically when I create a program" issue). Existing origin is
      // preserved for explicitly-classified dances.
      for (const localId of preExistingLocalIds) {
        if (cloudLocalIds.has(localId)) continue;
        if (getDanceOrigin(localId) === null) {
          setDanceOrigin(localId, "local-only");
        }
      }

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

      // Notify subscribers (Editor / Library) that the dance + custom lists
      // changed so they re-read from localStorage. Without these bumps the
      // newly-mirrored cloud rows are invisible until the next page refresh
      // even though they're already on disk.
      if (snap.dances.length > 0) bumpCounter("dances");
      if (snap.customAnimations.length > 0) bumpCounter("customAnimations");

      try {
        window.localStorage.setItem(CLOUD_SESSION_KEY, programId);
      } catch {
        // localStorage might be unavailable (private mode); session reconnect
        // will simply not auto-resume. Non-fatal.
      }
    },
    [bumpCounter],
  );

  const createProgram = useCallback(
    async (programName: string, displayName: string) => {
      try {
        const { programId, shareCode } = await createCloudProgram(programName, displayName);
        // Note: we deliberately do NOT auto-push existing local dances.
        // The previous behavior dragged the user's "New Dance" draft into
        // the freshly-created shared program against their will. Now they
        // pick per-dance via "+ New (Cloud)" / "+ New (Local)" or push the
        // whole batch via the explicit Push button.
        await enterProgram(programId, displayName);
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
    // Strict separation: in local mode we should NOT see any dance that
    // belongs to the cloud program. So at leave time we evict every dance
    // we tagged as cloud-mine OR cloud-imported. Only local-only (and
    // unmarked legacy) dances stay in localStorage. Cloud rows are
    // untouched on the server — re-joining will re-pull what's actually
    // on cloud (which will not include anything we genuinely deleted via
    // the Delete button while in cloud mode).
    const programId = stateRef.current?.program.id ?? null;
    const cloudDanceIds = getAllDances()
      .filter((d) => {
        const o = getDanceOrigin(d.id);
        return o === "cloud-mine" || o === "cloud-imported";
      })
      .map((d) => d.id);

    // Cancel pending debounced saves first so flushDebouncedSaves (in the
    // storage-hook effect cleanup) doesn't push these dances after we've
    // deleted them locally.
    for (const id of cloudDanceIds) {
      cancelDebouncedSave(`dance:${id}`);
    }
    if (cloudDanceIds.length > 0) {
      // Suppress hooks: we don't want the local delete to fire onDanceDeleted
      // and erase the row on the server. We're just shedding our local
      // mirror; the cloud copy stays.
      withSuppressedHooks(() => {
        for (const id of cloudDanceIds) {
          deleteDance(id);
        }
      });
      bumpCounter("dances");
    }

    // Wipe the local-id ↔ cloud-id mapping so a re-join starts from a clean
    // slate (loadCloudProgram will reseed it from the snapshot).
    if (programId) clearCloudIdMap(programId);

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
  }, [bumpCounter]);

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

  // "Push local" only promotes private (local-only / unmarked legacy)
  // dances to cloud-mine. It deliberately skips:
  //   - cloud-mine dances → already auto-syncing via the mirror; resending
  //     would be a redundant network hit.
  //   - cloud-imported dances → those are teammates' work; pushing our
  //     possibly-stale local copy would overwrite their newer edits.
  // It also no longer pushes arrangement / custom animations / export
  // settings as a batch — those sync continuously through their own
  // mirror hooks, and a wholesale push could clobber a teammate's
  // arrangement reorder mid-session.
  const pushLocalToCloud = useCallback(async () => {
    if (!state) return;
    const pid = state.program.id;
    const candidates = getAllDances().filter((d) => {
      const o = getDanceOrigin(d.id);
      return o === "local-only" || o === null;
    });
    if (candidates.length === 0) {
      flashSaved();
      return;
    }
    setStatus("saving");
    try {
      for (const dance of candidates) {
        await saveCloudDance(pid, dance);
        setDanceOrigin(dance.id, "cloud-mine");
      }
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
