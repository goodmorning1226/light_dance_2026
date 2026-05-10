import type { DanceProject, ProgramArrangement, ProgramItem } from "@/types";
import { parseProgramArrangement } from "@/lib/io";
import { readJson, writeJson } from "./backend";
import { getCloudMirrorHooks } from "./cloudMirror";
import { createId } from "./ids";

const KEY_PROGRAM = "ld26:program";

function defaultProgram(): ProgramArrangement {
  return {
    schemaVersion: 1,
    type: "led-program",
    id: "program-default",
    name: "Untitled Program",
    items: [],
  };
}

function loadProgram(): ProgramArrangement {
  const raw = readJson<unknown>(KEY_PROGRAM, null);
  if (raw === null) return defaultProgram();
  try {
    return parseProgramArrangement(raw, "");
  } catch (e) {
    console.warn(
      `[storage] program corrupt, resetting:`,
      e instanceof Error ? e.message : String(e),
    );
    return defaultProgram();
  }
}

function persistProgram(program: ProgramArrangement): void {
  writeJson(KEY_PROGRAM, program);
  getCloudMirrorHooks().onProgramSaved?.(program);
}

function applyPartial<T extends object>(base: T, patch: Partial<T>): T {
  const out = { ...base };
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const v = patch[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

export function getProgram(): ProgramArrangement {
  return loadProgram();
}

export function saveProgram(program: ProgramArrangement): void {
  persistProgram(program);
}

export function addDanceToProgram(dance: DanceProject, mqttCommand: string): ProgramItem {
  const program = loadProgram();
  const item: ProgramItem = {
    id: createId("item"),
    danceId: dance.id,
    mqttCommand,
    dance,
  };
  program.items.push(item);
  persistProgram(program);
  return item;
}

export function removeDanceFromProgram(itemId: string): void {
  const program = loadProgram();
  program.items = program.items.filter((item) => item.id !== itemId);
  persistProgram(program);
}

export function updateProgramItem(itemId: string, patch: Partial<ProgramItem>): void {
  const program = loadProgram();
  const idx = program.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return;
  const old = program.items[idx];
  if (!old) return;
  program.items[idx] = applyPartial(old, patch);
  persistProgram(program);
}

export function duplicateProgramItem(itemId: string): ProgramItem | null {
  const program = loadProgram();
  const idx = program.items.findIndex((i) => i.id === itemId);
  if (idx < 0) return null;
  const orig = program.items[idx];
  if (!orig) return null;
  const copy: ProgramItem = {
    id: createId("item"),
    danceId: orig.danceId,
    mqttCommand: orig.mqttCommand,
  };
  if (orig.dance !== undefined) copy.dance = orig.dance;
  program.items.splice(idx + 1, 0, copy);
  persistProgram(program);
  return copy;
}

export function reorderProgramItems(sourceIndex: number, targetIndex: number): void {
  const program = loadProgram();
  if (sourceIndex === targetIndex) return;
  if (sourceIndex < 0 || sourceIndex >= program.items.length) return;
  if (targetIndex < 0 || targetIndex >= program.items.length) return;
  const [moved] = program.items.splice(sourceIndex, 1);
  if (!moved) return;
  program.items.splice(targetIndex, 0, moved);
  persistProgram(program);
}
