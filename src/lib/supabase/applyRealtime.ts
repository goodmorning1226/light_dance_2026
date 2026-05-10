"use client";

import type {
  CustomAnimation,
  DanceProject,
  ExportSettings,
  ProgramArrangement,
  ProgramItem,
} from "@/types";
import {
  deleteCustomAnimation,
  deleteDance,
  getDanceOrigin,
  getProgram,
  saveCustomAnimation,
  saveDance,
  saveExportSettings,
  saveProgram,
  setDanceOrigin,
  withSuppressedHooks,
} from "@/lib/storage";
import {
  findLocalIdByCloudId,
  setCloudId,
} from "./cloudIdMap";
import { isRecentSelfSave } from "./recentSelfSaves";
import type { RealtimeRowEvent } from "./realtime";

// Apply a single incoming realtime row event to localStorage. Returns a
// description of what changed (so the provider can bump per-table version
// counters that subscribed UI watches for re-reads), or null if the event
// was ignored (e.g. echo of our own write, or an unhandled table).

export type AppliedKind =
  | "dances"
  | "program_items"
  | "custom_animations"
  | "export_settings"
  | "program_members";

export interface AppliedRealtimeChange {
  kind: AppliedKind;
  type: "INSERT" | "UPDATE" | "DELETE";
}

export function applyRealtimeEvent(
  programId: string,
  event: RealtimeRowEvent,
): AppliedRealtimeChange | null {
  const cloudId = (event.row["id"] ?? event.row["program_id"]) as string | undefined;

  // Echo suppression — if we wrote this row in the last few seconds, the
  // postgres_changes broadcast is just our own change coming back.
  if (cloudId && isRecentSelfSave(event.table, cloudId)) {
    return null;
  }

  switch (event.table) {
    case "dances":
      return applyDanceEvent(programId, event);
    case "program_items":
      return applyProgramItemsEvent(programId);
    case "custom_animations":
      return applyCustomAnimationEvent(programId, event);
    case "export_settings":
      return applyExportSettingsEvent(event);
    case "program_members":
      // Membership changes are reflected in the snapshot pulled on reload;
      // the provider will refresh members via reloadProgram(). Return a
      // descriptor so the caller can decide what to do.
      return { kind: "program_members", type: event.type };
    default:
      return null;
  }
}

// ===== Per-table appliers =====

interface DanceRow {
  id: string;
  program_id: string;
  name: string | null;
  dance_json: DanceProject;
  updated_at: string;
}

function applyDanceEvent(
  programId: string,
  event: RealtimeRowEvent,
): AppliedRealtimeChange | null {
  const row = event.row as unknown as DanceRow;
  if (event.type === "DELETE") {
    const localId = findLocalIdByCloudId(programId, "dances", row.id);
    if (!localId) return { kind: "dances", type: "DELETE" };
    withSuppressedHooks(() => deleteDance(localId));
    return { kind: "dances", type: "DELETE" };
  }
  // INSERT or UPDATE: dance_json carries the canonical DanceProject. Keep
  // the local-id ↔ cloud-id mapping in sync (a freshly-inserted dance from
  // another client introduces a new mapping).
  const dance = row.dance_json;
  if (!dance || typeof dance !== "object" || !dance.id) return null;
  setCloudId(programId, "dances", dance.id, row.id);
  // Origin: only set if we have no opinion yet. A teammate's INSERT for a
  // dance we'd never seen → "cloud-imported" so leaveProgram can reclaim it.
  // We never overwrite "cloud-mine" / "local-only" already set by us.
  if (getDanceOrigin(dance.id) === null) {
    setDanceOrigin(dance.id, "cloud-imported");
  }
  withSuppressedHooks(() => saveDance(dance));
  return { kind: "dances", type: event.type };
}

// program_items have a per-row UPDATE per ordering change; rebuilding the
// whole arrangement from current localStorage + the realtime row is brittle
// (we only see one row at a time and can't know the new full order until
// we pull the table). Simplest correct approach: trigger a re-pull via the
// caller. We still apply a minimal local update (delete row) so the UI
// doesn't show a ghost item before the pull completes.
function applyProgramItemsEvent(
  programId: string,
): AppliedRealtimeChange | null {
  // We don't try to mutate the local arrangement here — the
  // CloudModeProvider listens for this kind and refetches the snapshot.
  // Returning the descriptor is enough for the caller to bump a counter.
  void programId;
  return { kind: "program_items", type: "UPDATE" };
}

interface CustomAnimationRow {
  id: string;
  program_id: string;
  animation_json: CustomAnimation;
}

function applyCustomAnimationEvent(
  programId: string,
  event: RealtimeRowEvent,
): AppliedRealtimeChange | null {
  const row = event.row as unknown as CustomAnimationRow;
  if (event.type === "DELETE") {
    const localId = findLocalIdByCloudId(programId, "customAnimations", row.id);
    if (!localId) return { kind: "custom_animations", type: "DELETE" };
    withSuppressedHooks(() => deleteCustomAnimation(localId));
    return { kind: "custom_animations", type: "DELETE" };
  }
  const animation = row.animation_json;
  if (!animation || typeof animation !== "object" || !animation.id) return null;
  setCloudId(programId, "customAnimations", animation.id, row.id);
  withSuppressedHooks(() => saveCustomAnimation(animation));
  return { kind: "custom_animations", type: event.type };
}

interface ExportSettingsRow {
  program_id: string;
  settings_json: ExportSettings;
}

function applyExportSettingsEvent(
  event: RealtimeRowEvent,
): AppliedRealtimeChange | null {
  if (event.type === "DELETE") {
    // Don't blow away local export settings just because the cloud row was
    // deleted (e.g. someone leaving). Defaults will fill in next time anyway.
    return { kind: "export_settings", type: "DELETE" };
  }
  const row = event.row as unknown as ExportSettingsRow;
  const settings = row.settings_json;
  if (!settings || typeof settings !== "object") return null;
  withSuppressedHooks(() => saveExportSettings(settings));
  return { kind: "export_settings", type: event.type };
}

// Convenience: apply a fresh full arrangement (used by the provider after
// it pulls the current program_items list because realtime can't reorder
// on its own).
export function applyArrangement(
  programId: string,
  items: Array<{ id: string; danceId: string; mqttCommand: string; dance?: DanceProject }>,
): void {
  void programId;
  const next: ProgramArrangement = {
    ...getProgram(),
    items: items.map<ProgramItem>((it) => {
      const item: ProgramItem = {
        id: it.id,
        danceId: it.danceId,
        mqttCommand: it.mqttCommand,
      };
      if (it.dance !== undefined) item.dance = it.dance;
      return item;
    }),
  };
  withSuppressedHooks(() => saveProgram(next));
}
