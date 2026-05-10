import type { CustomAnimation, ExportMode, ProgramArrangement } from "@/types";
import { dedupeIdentifiers, sanitizeCppIdentifier } from "./sanitize";
import { generateDanceCpp } from "./dance";
import { generateCustomAnimationsCpp } from "./customAnimations";

const OFFLINE_TIMELINE_HELPER = `// ----- Offline-safe timeline delay (drop-in for timelineDelay; no MQTT) -----
void timelineDelaySafe(unsigned long interval) {
    nextBeatMillis += interval;
    long remain;
    while ((remain = (long)(nextBeatMillis - millis())) > 0 && danceRunning) {
        delay(1);
    }
}`;

export function generateProgramCpp(
  programArrangement: ProgramArrangement,
  exportMode: ExportMode,
): string {
  // Aggregate custom animations across every embedded dance, deduped by id.
  const allCustoms: CustomAnimation[] = [];
  const seenIds = new Set<string>();
  for (const item of programArrangement.items) {
    if (!item.dance) continue;
    for (const ca of item.dance.customAnimations) {
      if (seenIds.has(ca.id)) continue;
      seenIds.add(ca.id);
      allCustoms.push(ca);
    }
  }

  // Compute a unique safeName per item so two dances that sanitize to the
  // same identifier don't produce duplicate `dance<X>()` definitions.
  const safeDanceNames = dedupeIdentifiers(
    programArrangement.items.map((item) =>
      item.dance ? sanitizeCppIdentifier(item.dance.name) : "",
    ),
  );

  const blocks: string[] = [];
  blocks.push(`// =====================================================================`);
  blocks.push(`// Program: ${programArrangement.name}`);
  blocks.push(`// Export mode: ${exportMode}`);
  blocks.push(`// Items: ${programArrangement.items.length}`);
  blocks.push(`// =====================================================================`);

  if (allCustoms.length > 0) {
    blocks.push("");
    blocks.push(`// --- Custom animations ---`);
    blocks.push(generateCustomAnimationsCpp(allCustoms, exportMode));
  }

  if (exportMode === "offline") {
    blocks.push("");
    blocks.push(OFFLINE_TIMELINE_HELPER);
  }

  for (let i = 0; i < programArrangement.items.length; i++) {
    const item = programArrangement.items[i]!;
    if (!item.dance) {
      blocks.push("");
      blocks.push(`// Skipped item ${item.id}: no embedded dance for danceId="${item.danceId}".`);
      continue;
    }
    blocks.push("");
    const safeName = safeDanceNames[i] ?? sanitizeCppIdentifier(item.dance.name);
    blocks.push(generateDanceCpp(item.dance, exportMode, { safeName }));
  }

  if (exportMode === "online") {
    blocks.push("");
    blocks.push(`// --- MQTT callback snippet ---`);
    blocks.push(`// Paste each branch into callback() in light_dance_2026.ino, after the`);
    blocks.push(`// existing else-if chain.`);
    blocks.push(`/*`);
    for (let i = 0; i < programArrangement.items.length; i++) {
      const item = programArrangement.items[i]!;
      if (!item.dance) continue;
      const safeName = safeDanceNames[i]!;
      blocks.push(`    else if (messageTemp == "${item.mqttCommand}") {`);
      blocks.push(`        Serial.println("Triggering: ${item.dance.name}");`);
      blocks.push(`        before();`);
      blocks.push(`        danceRunning = true;`);
      blocks.push(`        dance${safeName}();`);
      blocks.push(`        showEndSignal();`);
      blocks.push(`    }`);
    }
    blocks.push(`*/`);
  } else {
    blocks.push("");
    blocks.push(`// --- Offline test entry point ---`);
    blocks.push(`// Define OFFLINE_TEST=1 and call offlineTest() from setup() to play the`);
    blocks.push(`// arrangement without WiFi/MQTT. Comment out setup_wifi()/reconnect()`);
    blocks.push(`// calls in setup() / loop() when running offline.`);
    blocks.push(`#define OFFLINE_TEST 1`);
    blocks.push("");
    blocks.push(`void offlineTest() {`);
    blocks.push(`    danceRunning = true;`);
    blocks.push(`    startTimeline();`);
    for (let i = 0; i < programArrangement.items.length; i++) {
      const item = programArrangement.items[i]!;
      if (!item.dance) continue;
      const safeName = safeDanceNames[i]!;
      blocks.push(`    dance${safeName}();`);
      blocks.push(`    if (!danceRunning) return;`);
    }
    blocks.push(`    stopEffect();`);
    blocks.push(`}`);
  }

  return blocks.join("\n");
}
