"use client";

import { readJson, writeJson } from "./backend";

// How a dance came to be present in this browser. Drives:
//   - The cloud-mirror hook: "local-only" dances never sync to Supabase even
//     in cloud mode (so the user can keep private drafts).
//   - The leave-cloud cleanup: "cloud-imported" dances (created by teammates
//     and pulled down via realtime / initial load) are removed from
//     localStorage when the user leaves the program, so the local list isn't
//     polluted with strangers' content. "local-only" and "cloud-mine" dances
//     stay.
//
// An entry of `null` (no record) is treated as "cloud-mine" by sync (mirror
// runs as before — backward compat with pre-origin data) and as "keep" by
// leave (we don't delete dances we have no opinion on).
export type DanceOrigin = "local-only" | "cloud-mine" | "cloud-imported";

const KEY_DANCE_ORIGINS = "ld26:danceOrigins";

type OriginMap = Record<string, DanceOrigin>;

function loadMap(): OriginMap {
  const raw = readJson<unknown>(KEY_DANCE_ORIGINS, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: OriginMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === "local-only" || v === "cloud-mine" || v === "cloud-imported") {
      out[k] = v;
    }
  }
  return out;
}

function saveMap(map: OriginMap): void {
  writeJson(KEY_DANCE_ORIGINS, map);
}

export function getDanceOrigin(danceId: string): DanceOrigin | null {
  return loadMap()[danceId] ?? null;
}

export function setDanceOrigin(danceId: string, origin: DanceOrigin): void {
  const map = loadMap();
  map[danceId] = origin;
  saveMap(map);
}

export function removeDanceOrigin(danceId: string): void {
  const map = loadMap();
  if (!(danceId in map)) return;
  delete map[danceId];
  saveMap(map);
}

export function isLocalOnlyDance(danceId: string): boolean {
  return getDanceOrigin(danceId) === "local-only";
}

export function isCloudImportedDance(danceId: string): boolean {
  return getDanceOrigin(danceId) === "cloud-imported";
}

// Used by the leave-cloud flow to find which dances to drop.
export function getCloudImportedDanceIds(): string[] {
  const map = loadMap();
  return Object.keys(map).filter((id) => map[id] === "cloud-imported");
}
