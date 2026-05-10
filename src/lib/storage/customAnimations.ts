import type { CustomAnimation } from "@/types";
import { parseCustomAnimation } from "@/lib/io";
import { readJson, writeJson } from "./backend";

const KEY_CUSTOM_ANIMATIONS = "ld26:customAnimations";

function loadCustomAnimations(): CustomAnimation[] {
  const raw = readJson<unknown>(KEY_CUSTOM_ANIMATIONS, []);
  if (!Array.isArray(raw)) return [];
  const result: CustomAnimation[] = [];
  raw.forEach((entry, i) => {
    try {
      result.push(parseCustomAnimation(entry, `customAnimations[${i}]`));
    } catch (e) {
      console.warn(
        `[storage] dropping invalid custom animation at index ${i}:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  });
  return result;
}

export function getAllCustomAnimations(): CustomAnimation[] {
  return loadCustomAnimations();
}

export function saveCustomAnimation(animation: CustomAnimation): void {
  const list = loadCustomAnimations();
  const idx = list.findIndex((a) => a.id === animation.id);
  if (idx >= 0) list[idx] = animation;
  else list.push(animation);
  writeJson(KEY_CUSTOM_ANIMATIONS, list);
}

export function deleteCustomAnimation(id: string): void {
  const list = loadCustomAnimations().filter((a) => a.id !== id);
  writeJson(KEY_CUSTOM_ANIMATIONS, list);
}
