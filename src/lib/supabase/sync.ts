"use client";

import type {
  CustomAnimation,
  DanceProject,
  ExportSettings,
  ProgramArrangement,
} from "@/types";
import { getSupabaseClient } from "./client";
import { getCloudId, getOrCreateCloudId, setCloudId } from "./cloudIdMap";
import { recordSelfSave } from "./recentSelfSaves";

// All saves use Supabase upsert with the cloud-uuid PK. The local id (which
// is what the editor and localStorage know about) is mapped to a stable
// cloud uuid via cloudIdMap, so re-saving always hits the SAME row.
//
// Each successful save calls recordSelfSave(table, cloudId) so the realtime
// echo of our own change is dropped on receive (otherwise we'd overwrite
// the user's in-progress edit with the row we just sent up).

export async function saveCloudDance(
  programId: string,
  dance: DanceProject,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { cloudId } = getOrCreateCloudId(programId, "dances", dance.id);
  const { error } = await supabase.from("dances").upsert(
    {
      id: cloudId,
      program_id: programId,
      name: dance.name,
      dance_json: dance,
      updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`saveCloudDance failed: ${error.message}`);
  recordSelfSave("dances", cloudId);
}

export async function deleteCloudDance(
  programId: string,
  localDanceId: string,
): Promise<void> {
  const cloudId = getCloudId(programId, "dances", localDanceId);
  if (!cloudId) return; // never synced; nothing to delete
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("dances")
    .delete()
    .eq("id", cloudId)
    .eq("program_id", programId);
  if (error) throw new Error(`deleteCloudDance failed: ${error.message}`);
  recordSelfSave("dances", cloudId);
}

// Replaces the WHOLE program_items list to match the supplied arrangement.
// Implementation: delete all existing rows for this program then insert
// fresh ones. Simpler than diff-and-patch and matches the spec's
// "保存目前 arrangement" semantics. Each affected row is recorded as a
// self-save so realtime echo is dropped.
export async function saveCloudArrangement(
  programId: string,
  arrangement: ProgramArrangement,
): Promise<void> {
  const supabase = getSupabaseClient();

  // First make sure every referenced dance exists in cloud and gets an id.
  for (const item of arrangement.items) {
    if (!item.dance) continue;
    await saveCloudDance(programId, item.dance);
  }

  const rows = arrangement.items
    .map((item, index) => {
      const danceCloudId = getCloudId(programId, "dances", item.danceId);
      if (!danceCloudId) return null;
      const itemCloudId = getOrCreateCloudId(programId, "programItems", item.id).cloudId;
      return {
        id: itemCloudId,
        program_id: programId,
        dance_id: danceCloudId,
        order_index: index,
        mqtt_command: item.mqttCommand,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Delete-all + insert pattern. Wrapped in a transaction-ish sequence;
  // Supabase REST has no atomic DELETE+INSERT, but the realtime subscribers
  // see the deletes first and the inserts second, which is good enough for
  // last-write-wins.
  const { error: delErr } = await supabase
    .from("program_items")
    .delete()
    .eq("program_id", programId);
  if (delErr) throw new Error(`saveCloudArrangement (delete): ${delErr.message}`);

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("program_items").insert(rows);
    if (insErr) throw new Error(`saveCloudArrangement (insert): ${insErr.message}`);
  }

  // Mark every inserted row as a self-save so the realtime echoes are
  // ignored when they arrive.
  for (const r of rows) {
    recordSelfSave("program_items", r.id);
  }
}

export async function saveCloudExportSettings(
  programId: string,
  settings: ExportSettings,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("export_settings").upsert(
    {
      program_id: programId,
      settings_json: settings,
      updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    },
    { onConflict: "program_id" },
  );
  if (error) throw new Error(`saveCloudExportSettings failed: ${error.message}`);
  // export_settings is keyed by program_id (1:1) — that's what realtime
  // sees in payload.new.id since the table's PK is program_id.
  recordSelfSave("export_settings", programId);
}

export async function saveCloudCustomAnimation(
  programId: string,
  animation: CustomAnimation,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { cloudId } = getOrCreateCloudId(programId, "customAnimations", animation.id);
  const { error } = await supabase.from("custom_animations").upsert(
    {
      id: cloudId,
      program_id: programId,
      animation_json: animation,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`saveCloudCustomAnimation failed: ${error.message}`);
  recordSelfSave("custom_animations", cloudId);
}

export async function deleteCloudCustomAnimation(
  programId: string,
  localAnimationId: string,
): Promise<void> {
  const cloudId = getCloudId(programId, "customAnimations", localAnimationId);
  if (!cloudId) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("custom_animations")
    .delete()
    .eq("id", cloudId)
    .eq("program_id", programId);
  if (error) throw new Error(`deleteCloudCustomAnimation failed: ${error.message}`);
  recordSelfSave("custom_animations", cloudId);
}

// Convenience: push EVERYTHING currently in localStorage to cloud. Used
// when a user with existing local work creates a new cloud program — the
// "send my local dances up" path.
export async function pushLocalSnapshotToCloud(
  programId: string,
  payload: {
    dances: DanceProject[];
    arrangement: ProgramArrangement;
    customAnimations: CustomAnimation[];
    exportSettings: ExportSettings;
  },
): Promise<void> {
  for (const dance of payload.dances) {
    await saveCloudDance(programId, dance);
  }
  for (const ca of payload.customAnimations) {
    await saveCloudCustomAnimation(programId, ca);
  }
  await saveCloudArrangement(programId, payload.arrangement);
  await saveCloudExportSettings(programId, payload.exportSettings);
}

// ===== Per-key debouncer =====
// Save bursts (e.g. dragging an event) would otherwise produce a flurry of
// upserts. Coalesce them by key — only the most-recent payload survives.

interface DebounceEntry {
  timer: number;
  pending: () => Promise<void>;
}

const debouncers = new Map<string, DebounceEntry>();

export function debounceSave(
  key: string,
  delayMs: number,
  fn: () => Promise<void>,
): void {
  const existing = debouncers.get(key);
  if (existing) {
    window.clearTimeout(existing.timer);
  }
  const timer = window.setTimeout(() => {
    debouncers.delete(key);
    void fn().catch((e) => {
      console.error(`[debounceSave:${key}]`, e);
    });
  }, delayMs);
  debouncers.set(key, { timer, pending: fn });
}

export function flushDebouncedSaves(): Promise<void> {
  const all: Promise<void>[] = [];
  for (const [key, entry] of Array.from(debouncers.entries())) {
    window.clearTimeout(entry.timer);
    debouncers.delete(key);
    all.push(entry.pending().catch((e) => console.error(`[flushDebouncedSaves:${key}]`, e)));
  }
  return Promise.all(all).then(() => undefined);
}

// Re-exported here so consumers don't need to remember a separate module.
export { setCloudId, getCloudId } from "./cloudIdMap";
