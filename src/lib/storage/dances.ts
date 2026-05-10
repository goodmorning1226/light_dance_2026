import type { DanceProject } from "@/types";
import { parseDanceProject } from "@/lib/io";
import { readJson, removeKey, writeJson } from "./backend";
import { createId } from "./ids";
import { getProgram, saveProgram } from "./program";

const KEY_DANCES = "ld26:dances";
const KEY_CURRENT_DANCE_ID = "ld26:currentDanceId";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Always re-read + re-validate so storage is the source of truth, never an
// in-memory cache that could drift from another tab.
function loadDances(): DanceProject[] {
  const raw = readJson<unknown>(KEY_DANCES, []);
  if (!Array.isArray(raw)) return [];
  const result: DanceProject[] = [];
  raw.forEach((entry, i) => {
    try {
      result.push(parseDanceProject(entry, `dances[${i}]`));
    } catch (e) {
      console.warn(
        `[storage] dropping invalid dance at index ${i}:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  });
  return result;
}

function saveAllDances(list: DanceProject[]): void {
  writeJson(KEY_DANCES, list);
}

export function getAllDances(): DanceProject[] {
  return loadDances();
}

export function getDance(id: string): DanceProject | null {
  return loadDances().find((d) => d.id === id) ?? null;
}

export function saveDance(dance: DanceProject): void {
  const list = loadDances();
  const idx = list.findIndex((d) => d.id === dance.id);
  if (idx >= 0) list[idx] = dance;
  else list.push(dance);
  saveAllDances(list);
  syncSnapshotInProgram(dance);
}

// Keep ProgramItem.dance snapshots fresh whenever the underlying dance is
// edited. Without this the arrangement page would keep showing stale data
// after a Save in the editor.
function syncSnapshotInProgram(dance: DanceProject): void {
  const program = getProgram();
  let changed = false;
  const nextItems = program.items.map((item) => {
    if (item.danceId !== dance.id) return item;
    changed = true;
    return { ...item, dance };
  });
  if (changed) saveProgram({ ...program, items: nextItems });
}

export function deleteDance(id: string): void {
  const list = loadDances().filter((d) => d.id !== id);
  saveAllDances(list);
  if (getCurrentDanceId() === id) {
    setCurrentDanceId(null);
  }
}

export function duplicateDance(id: string): DanceProject {
  const original = getDance(id);
  if (!original) {
    throw new Error(`Dance "${id}" not found`);
  }
  const clone = deepClone(original);
  clone.id = createId("dance");
  clone.name = `${original.name} (copy)`;
  for (const section of clone.sections) {
    section.id = createId("section");
    for (const step of section.steps) {
      step.id = createId("step");
    }
  }
  saveDance(clone);
  return clone;
}

export function getCurrentDanceId(): string | null {
  const raw = readJson<unknown>(KEY_CURRENT_DANCE_ID, null);
  return typeof raw === "string" ? raw : null;
}

export function setCurrentDanceId(id: string | null): void {
  if (id === null) {
    removeKey(KEY_CURRENT_DANCE_ID);
  } else {
    writeJson(KEY_CURRENT_DANCE_ID, id);
  }
}
