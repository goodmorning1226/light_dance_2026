import { defaultExportSettings, type ExportSettings } from "@/types";
import { readJson, writeJson } from "./backend";

const KEY_EXPORT_SETTINGS = "ld26:exportSettings";

// Loads settings, merging onto defaults so a key added after the last save
// is filled in instead of being undefined.
export function getExportSettings(): ExportSettings {
  const raw = readJson<unknown>(KEY_EXPORT_SETTINGS, null);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultExportSettings();
  }
  return { ...defaultExportSettings(), ...(raw as Partial<ExportSettings>) };
}

export function saveExportSettings(settings: ExportSettings): void {
  writeJson(KEY_EXPORT_SETTINGS, settings);
}
