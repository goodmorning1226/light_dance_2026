import type {
  CustomAnimation,
  ExportMode,
  ExportSettings,
  ProgramArrangement,
} from "@/types";
import { defaultExportSettings } from "@/types";
import { dedupeIdentifiers, sanitizeCppIdentifier } from "./sanitize";
import { computeDanceFunctionNames, generateDanceCpp } from "./dance";
import { generateCustomAnimationsCpp } from "./customAnimations";
import {
  CODE_END,
  CODE_START,
  FWD_END,
  FWD_START,
  insertMarkedBlock,
  insertMqttBranches,
  patchLoopForOffline,
  patchSetupForOffline,
  removeOfflinePatches,
  removeOnlinePatches,
  validateGeneratedIno,
} from "./insertion";
import {
  applyHardwareSettings,
  generateMinimalCallbackBody,
  generateMinimalLoopBody,
  generateMinimalSetupBody,
  replaceFunctionBody,
  stripLegacyExampleSongs,
} from "./minimalIno";

const OFFLINE_TIMELINE_HELPER = `// ----- Offline-safe timeline delay (drop-in for timelineDelay; no MQTT) -----
void timelineDelaySafe(unsigned long interval) {
    nextBeatMillis += interval;
    long remain;
    while ((remain = (long)(nextBeatMillis - millis())) > 0 && danceRunning) {
        delay(1);
    }
}`;

interface GeneratedParts {
  forwardDecls: string;
  danceCode: string;
  mqttBranches: string;
}

function safeNamesForArrangement(arrangement: ProgramArrangement): string[] {
  return dedupeIdentifiers(
    arrangement.items.map((item) =>
      item.dance ? sanitizeCppIdentifier(item.dance.name) : "",
    ),
  );
}

function exportModeOf(settings: ExportSettings): ExportMode {
  return settings.exportType === "full-offline-ino" ? "offline" : "online";
}

function buildGeneratedParts(
  arrangement: ProgramArrangement,
  settings: ExportSettings,
): GeneratedParts {
  const exportMode = exportModeOf(settings);

  // Dedup custom animations across all items by id.
  const allCustoms: CustomAnimation[] = [];
  const seenIds = new Set<string>();
  for (const item of arrangement.items) {
    if (!item.dance) continue;
    for (const ca of item.dance.customAnimations) {
      if (seenIds.has(ca.id)) continue;
      seenIds.add(ca.id);
      allCustoms.push(ca);
    }
  }

  const safeDanceNames = safeNamesForArrangement(arrangement);

  const fwdLines: string[] = [];
  if (allCustoms.length > 0) {
    fwdLines.push("// Custom animation declarations");
    for (const ca of allCustoms) {
      fwdLines.push(`void ${ca.functionName}(const BodyPart& part, CRGB color, int duration);`);
    }
    fwdLines.push("");
  }
  fwdLines.push("// Generated dance function declarations");
  for (let i = 0; i < arrangement.items.length; i++) {
    const item = arrangement.items[i]!;
    if (!item.dance) continue;
    const safeName = safeDanceNames[i]!;
    const { danceFnName } = computeDanceFunctionNames(item.dance, safeName);
    fwdLines.push(`void ${danceFnName}();`);
  }
  if (exportMode === "offline") {
    fwdLines.push("void timelineDelaySafe(unsigned long interval);");
    fwdLines.push("void offlineTest();");
  }

  const codeBlocks: string[] = [];
  if (allCustoms.length > 0) {
    codeBlocks.push("// --- Custom animations ---");
    codeBlocks.push(generateCustomAnimationsCpp(allCustoms, exportMode));
  }
  if (exportMode === "offline") {
    codeBlocks.push(OFFLINE_TIMELINE_HELPER);
  }
  for (let i = 0; i < arrangement.items.length; i++) {
    const item = arrangement.items[i]!;
    if (!item.dance) continue;
    const safeName = safeDanceNames[i]!;
    codeBlocks.push(generateDanceCpp(item.dance, exportMode, { safeName }));
  }
  if (exportMode === "offline") {
    codeBlocks.push(buildOfflineTestFn(arrangement, safeDanceNames, settings));
  }

  // mqttCommand verbatim from arrangement; never normalised.
  const mqttLines: string[] = [];
  for (let i = 0; i < arrangement.items.length; i++) {
    const item = arrangement.items[i]!;
    if (!item.dance) continue;
    const safeName = safeDanceNames[i]!;
    mqttLines.push(`else if (messageTemp == "${item.mqttCommand}") {`);
    mqttLines.push(`    Serial.println("Triggering: ${item.dance.name}");`);
    if (settings.showReadySignalBeforeDance) {
      mqttLines.push(`    showReadySignal();`);
    }
    mqttLines.push(`    FastLED.setBrightness(BRIGHTNESS);`);
    mqttLines.push(`    danceRunning = true;`);
    mqttLines.push(`    dance${safeName}();`);
    if (settings.showEndSignalAfterDance) {
      mqttLines.push(`    showEndSignal();`);
    }
    mqttLines.push(`}`);
  }

  return {
    forwardDecls: fwdLines.join("\n"),
    danceCode: codeBlocks.join("\n\n"),
    mqttBranches: mqttLines.join("\n"),
  };
}

function buildOfflineTestFn(
  arrangement: ProgramArrangement,
  safeDanceNames: ReadonlyArray<string>,
  settings: ExportSettings,
): string {
  const lines: string[] = [
    "// Offline entry point — called from setup() when OFFLINE_TEST is defined.",
    "void offlineTest() {",
    `    Serial.println("[OFFLINE_TEST] Starting offline run");`,
    "    danceRunning = true;",
  ];
  if (settings.showReadySignalBeforeDance) {
    lines.push("    showReadySignal();");
  }

  switch (settings.offlineRunMode) {
    case "runArrangementOnce": {
      lines.push("    startTimeline();");
      for (let i = 0; i < arrangement.items.length; i++) {
        const item = arrangement.items[i]!;
        if (!item.dance) continue;
        const safeName = safeDanceNames[i]!;
        lines.push(`    dance${safeName}();`);
      }
      break;
    }
    case "loopArrangement": {
      lines.push("    while (danceRunning) {");
      lines.push("        startTimeline();");
      for (let i = 0; i < arrangement.items.length; i++) {
        const item = arrangement.items[i]!;
        if (!item.dance) continue;
        const safeName = safeDanceNames[i]!;
        lines.push(`        dance${safeName}();`);
        lines.push(`        if (!danceRunning) break;`);
      }
      lines.push("        delay(1000);");
      lines.push("    }");
      break;
    }
    case "runSelectedDance": {
      const selectedId = settings.offlineSelectedDanceId;
      if (!selectedId) {
        throw new Error(
          "offlineRunMode=runSelectedDance requires offlineSelectedDanceId. " +
            "Pick a dance in the Export Settings panel before exporting.",
        );
      }
      const idx = arrangement.items.findIndex((i) => i.danceId === selectedId);
      if (idx < 0) {
        throw new Error(
          `offlineSelectedDanceId "${selectedId}" not found in arrangement. ` +
            "Update the setting or add the dance to the arrangement first.",
        );
      }
      const safeName = safeDanceNames[idx]!;
      const danceName = arrangement.items[idx]?.dance?.name ?? selectedId;
      lines.push(`    Serial.println("[OFFLINE_TEST] Selected: ${danceName}");`);
      if (settings.loopAfterFinish) {
        lines.push("    while (danceRunning) {");
        lines.push("        startTimeline();");
        lines.push(`        dance${safeName}();`);
        lines.push(`        if (!danceRunning) break;`);
        lines.push("        delay(1000);");
        lines.push("    }");
      } else {
        lines.push("    startTimeline();");
        lines.push(`    dance${safeName}();`);
      }
      break;
    }
  }

  if (settings.showEndSignalAfterDance) {
    lines.push("    showEndSignal();");
  }
  lines.push("    stopEffect();");
  lines.push("}");
  return lines.join("\n");
}

function setOfflineTestDefine(base: string, on: boolean): string {
  if (on) {
    if (/^#define\s+OFFLINE_TEST\b/m.test(base)) {
      return base.replace(/^#define\s+OFFLINE_TEST\s+\d+\b.*$/m, "#define OFFLINE_TEST 1");
    }
    const lines = base.split("\n");
    let lastIncludeIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^#include\b/.test(lines[i] ?? "")) lastIncludeIdx = i;
    }
    if (lastIncludeIdx >= 0) {
      lines.splice(lastIncludeIdx + 1, 0, "", "#define OFFLINE_TEST 1");
      return lines.join("\n");
    }
    return "#define OFFLINE_TEST 1\n\n" + base;
  } else {
    return base.replace(/^#define\s+OFFLINE_TEST\b.*\n?/m, "");
  }
}

function findForwardDeclInsertionPoint(base: string): number {
  const anchor = "bool shouldContinueDance();";
  const idx = base.indexOf(anchor);
  if (idx < 0) {
    throw new Error(
      `Cannot find forward-declaration anchor "${anchor}" in base .ino. Aborting full export to avoid producing a broken .ino.`,
    );
  }
  return idx + anchor.length;
}

function mergeSettings(
  base: ExportSettings,
  override: Partial<ExportSettings>,
): ExportSettings {
  const merged: ExportSettings = { ...base, ...override };
  if (override.offlineSelectedDanceId === undefined && base.offlineSelectedDanceId !== undefined) {
    merged.offlineSelectedDanceId = base.offlineSelectedDanceId;
  }
  return merged;
}

function settingsFor(
  exportType: ExportSettings["exportType"],
  override: Partial<ExportSettings>,
): ExportSettings {
  const merged = mergeSettings(defaultExportSettings(), { ...override, exportType });
  return merged;
}

// ===== Snippet =====

export function generateSnippetCpp(
  programArrangement: ProgramArrangement,
  settings: Partial<ExportSettings> = {},
): string {
  const full = settingsFor("snippet", settings);
  const parts = buildGeneratedParts(programArrangement, full);
  return [
    "// =====================================================================",
    `// Generated dance snippet for "${programArrangement.name}"`,
    `// Items: ${programArrangement.items.length}`,
    `// Mode:  online (use Full Offline / Full Online MQTT for whole-file output)`,
    "// =====================================================================",
    "",
    "// --- Forward declarations: paste near the top of light_dance_2026.ino ---",
    parts.forwardDecls,
    "",
    "// --- Dance functions: paste near the existing dance functions ---",
    parts.danceCode,
    "",
    "// --- MQTT callback branches: paste inside callback() if/else-if chain ---",
    "/*",
    parts.mqttBranches,
    "*/",
  ].join("\n");
}

// ===== Full-from-template =====

function generateFullFromTemplate(
  baseInoSource: string,
  programArrangement: ProgramArrangement,
  settings: ExportSettings,
): string {
  const exportMode = exportModeOf(settings);
  const parts = buildGeneratedParts(programArrangement, settings);

  let ino = baseInoSource;
  if (exportMode === "online") {
    ino = removeOfflinePatches(ino);
  } else {
    ino = removeOnlinePatches(ino);
  }
  ino = applyHardwareSettings(ino, settings);
  ino = setOfflineTestDefine(ino, exportMode === "offline");

  ino = insertMarkedBlock(ino, parts.forwardDecls, FWD_START, FWD_END, findForwardDeclInsertionPoint);
  ino = insertMarkedBlock(ino, parts.danceCode, CODE_START, CODE_END, (b) => b.length);

  if (exportMode === "online") {
    ino = insertMqttBranches(ino, parts.mqttBranches);
  } else {
    ino = patchSetupForOffline(ino);
    ino = patchLoopForOffline(ino);
  }

  validateGeneratedIno(ino);
  return ino;
}

// ===== Full-minimal =====

function generateFullMinimal(
  baseInoSource: string,
  programArrangement: ProgramArrangement,
  settings: ExportSettings,
): string {
  const exportMode = exportModeOf(settings);
  const parts = buildGeneratedParts(programArrangement, settings);

  let ino = baseInoSource;
  ino = stripLegacyExampleSongs(ino);
  ino = applyHardwareSettings(ino, settings);
  ino = setOfflineTestDefine(ino, exportMode === "offline");

  ino = replaceFunctionBody(
    ino,
    /void\s+setup\s*\(\s*\)\s*\{/,
    generateMinimalSetupBody(exportMode),
    "setup",
  );
  ino = replaceFunctionBody(
    ino,
    /void\s+callback\s*\(\s*char\s*\*[^)]*\)\s*\{/,
    generateMinimalCallbackBody(parts.mqttBranches),
    "callback",
  );
  ino = replaceFunctionBody(
    ino,
    /void\s+loop\s*\(\s*\)\s*\{/,
    generateMinimalLoopBody(exportMode),
    "loop",
  );

  ino = insertMarkedBlock(ino, parts.forwardDecls, FWD_START, FWD_END, findForwardDeclInsertionPoint);
  ino = insertMarkedBlock(ino, parts.danceCode, CODE_START, CODE_END, (b) => b.length);

  validateGeneratedIno(ino);
  return ino;
}

// ===== Public API =====

// Backward-compat: third parameter is `Partial<ExportSettings>` so callers
// can pass just `{ includeLegacyExampleDances: true }` (the old options
// shape) or the full settings object — both work.
export function generateFullOnlineMqttIno(
  baseInoSource: string,
  programArrangement: ProgramArrangement,
  settings: Partial<ExportSettings> = {},
): string {
  if (!baseInoSource || !baseInoSource.trim()) {
    throw new Error("Base .ino source is empty. Provide light_dance_2026.ino content.");
  }
  const full = settingsFor("full-online-mqtt-ino", settings);
  if (full.includeLegacyExampleDances) {
    return generateFullFromTemplate(baseInoSource, programArrangement, full);
  }
  return generateFullMinimal(baseInoSource, programArrangement, full);
}

export function generateFullOfflineIno(
  baseInoSource: string,
  programArrangement: ProgramArrangement,
  settings: Partial<ExportSettings> = {},
): string {
  if (!baseInoSource || !baseInoSource.trim()) {
    throw new Error("Base .ino source is empty. Provide light_dance_2026.ino content.");
  }
  const full = settingsFor("full-offline-ino", settings);
  if (full.includeLegacyExampleDances) {
    return generateFullFromTemplate(baseInoSource, programArrangement, full);
  }
  return generateFullMinimal(baseInoSource, programArrangement, full);
}

// Top-level dispatcher matching the user's spec signature. Picks the right
// generator based on settings.exportType. baseInoSource is required for
// full-offline-ino / full-online-mqtt-ino and ignored for snippet.
export function generateFullIno(
  programArrangement: ProgramArrangement,
  settings: ExportSettings,
  baseInoSource?: string,
): string {
  switch (settings.exportType) {
    case "snippet":
      return generateSnippetCpp(programArrangement, settings);
    case "full-offline-ino":
      if (!baseInoSource) {
        throw new Error(
          "baseInoSource is required for full-offline-ino export. Upload light_dance_2026.ino.",
        );
      }
      return generateFullOfflineIno(baseInoSource, programArrangement, settings);
    case "full-online-mqtt-ino":
      if (!baseInoSource) {
        throw new Error(
          "baseInoSource is required for full-online-mqtt-ino export. Upload light_dance_2026.ino.",
        );
      }
      return generateFullOnlineMqttIno(baseInoSource, programArrangement, settings);
  }
}
