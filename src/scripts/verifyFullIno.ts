// Tests for snippet / full-offline-ino / full-online-mqtt-ino generators.
// Reads the real light_dance_2026.ino as base template and asserts the patches
// stay safe and idempotent in both minimal mode (default) and from-template
// mode (includeLegacyExampleDances: true).

import * as fs from "node:fs";
import * as path from "node:path";
import { sampleProgramArrangement } from "@/data";
import type { DanceProject, ProgramArrangement } from "@/types";
import {
  findFunctionBody,
  generateFullIno,
  generateFullOfflineIno,
  generateFullOnlineMqttIno,
  generateSnippetCpp,
  insertMqttBranches,
  patchLoopForOffline,
  patchSetupForOffline,
  validateGeneratedIno,
} from "@/lib/codegen";
import { defaultExportSettings } from "@/types";

const INO_PATH = path.join(process.cwd(), "light_dance_2026.ino");
const BASE = fs.readFileSync(INO_PATH, "utf8");

let passes = 0;
let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
    passes++;
  } else {
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
    failures++;
  }
}

console.log("\n=== Snippet ===");
{
  const snippet = generateSnippetCpp(sampleProgramArrangement);
  check("snippet contains forward declarations section", snippet.includes("// --- Forward declarations"));
  check("snippet contains dance functions section", snippet.includes("// --- Dance functions"));
  check("snippet contains MQTT callback section", snippet.includes("// --- MQTT callback branches"));
  check("snippet uses online-style timelineDelay (no Safe variant)", snippet.includes("timelineDelay(") && !snippet.includes("timelineDelaySafe"));
}

console.log("\n=== Full Online MQTT .ino — minimal mode (default) ===");
{
  const ino = generateFullOnlineMqttIno(BASE, sampleProgramArrangement);

  check("preserves LED_PIN definition", ino.includes("#define LED_PIN 13"));
  check("preserves NUM_LEDS definition", ino.includes("#define NUM_LEDS 1000"));
  check("preserves BodyPart struct", /\bstruct\s+BodyPart\b/.test(ino));
  check("preserves Animation struct", /\bstruct\s+Animation\b/.test(ino));
  check("preserves fillBodyPart definition", /\bvoid\s+fillBodyPart\s*\(/.test(ino));
  check("preserves initializeLedRangeStarts definition", /void\s+initializeLedRangeStarts\s*\(\s*\)/.test(ino));
  check("preserves ALL_BLACK constant (referenced by Animation)", /\bconst\s+ColorSet\s+ALL_BLACK\b/.test(ino));

  check("DANCER forced to 1", /\bconst\s+int\s+DANCER\s*=\s*1\s*;/.test(ino));
  check("PERSON forced to 1", /^#define\s+PERSON\s+1\b/m.test(ino));
  check("ROLE forced to 1", /^#define\s+ROLE\s+1\b/m.test(ino));

  // Bug 1: MQTT branches must live INSIDE callback() body, not in struct LedRange.
  const callbackBody = findFunctionBody(ino, /void\s+callback\s*\(\s*char\s*\*[^)]*\)\s*\{/);
  const mqttIdx = ino.indexOf("// === GENERATED MQTT BRANCHES START ===");
  check(
    "MQTT branches block is INSIDE callback() body (not in struct LedRange / global scope)",
    callbackBody !== null && mqttIdx >= 0 && mqttIdx > callbackBody.bodyStart && mqttIdx < callbackBody.bodyEnd,
  );

  check("MQTT branch uses arrangement's mqttCommand verbatim (ON_OPENING)", ino.includes(`messageTemp == "ON_OPENING"`));
  check("MQTT branch calls the generated dance function", ino.includes("danceSampleDance();"));

  // Minimal mode strips legacy songs.
  check("minimal mode strips danceWhatMYB definition", !/\bvoid\s+danceWhatMYB\s*\(\s*\)\s*\{/.test(ino));
  check("minimal mode strips playMain1..29 definitions", !/\bvoid\s+playMain1\s*\(\s*\)\s*\{/.test(ino));
  check("minimal mode strips setupPart_LTDO", !/\bvoid\s+setupPart_LTDO\s*\(/.test(ino));
  check("minimal mode strips setupPart_shutUAD", !/\bvoid\s+setupPart_shutUAD\s*\(/.test(ino));
  check("minimal mode strips runAllAnimations", !/\bvoid\s+runAllAnimations\s*\(/.test(ino));
  check("minimal mode strips struct PlayStep", !/\bstruct\s+PlayStep\s*\{/.test(ino));
  check("minimal mode strips legacy COLORSET_ constants", !/\bCOLORSET_\d/.test(ino));
  check("minimal mode strips legacy color #defines", !/^#define\s+RED_1\b/m.test(ino));

  // No legacy refs left in setup() / callback().
  const setupBodyRange = findFunctionBody(ino, /void\s+setup\s*\(\s*\)\s*\{/);
  const setupBody = setupBodyRange ? ino.slice(setupBodyRange.bodyStart, setupBodyRange.bodyEnd) : "";
  check("setup() does not call setupPart_LTDO()", !setupBody.includes("setupPart_LTDO("));
  check("setup() does not call setupPart_shutUAD()", !setupBody.includes("setupPart_shutUAD("));
  check("setup() does not reference totalSteps / sequence", !setupBody.includes("totalSteps =") && !setupBody.includes("sequence.size()"));
  check("setup() still calls initializeLedRangeStarts()", setupBody.includes("initializeLedRangeStarts();"));

  const cbBodyRange = findFunctionBody(ino, /void\s+callback\s*\(\s*char\s*\*[^)]*\)\s*\{/);
  const cbBody = cbBodyRange ? ino.slice(cbBodyRange.bodyStart, cbBodyRange.bodyEnd) : "";
  check("callback() does not call runAllAnimations()", !cbBody.includes("runAllAnimations()"));
  check("callback() does not call danceWhatMYB()", !cbBody.includes("danceWhatMYB()"));
  check("callback() keeps OFF branch", cbBody.includes(`messageTemp == "OFF"`));
  check("callback() keeps READY branch", cbBody.includes(`messageTemp == "READY"`));

  check("does NOT define OFFLINE_TEST", !/^#define\s+OFFLINE_TEST\b/m.test(ino));

  // Idempotency
  const ino2 = generateFullOnlineMqttIno(ino, sampleProgramArrangement);
  check("re-export is idempotent (online → online)", ino === ino2);
}

console.log("\n=== mqttCommand verbatim preservation ===");
{
  // The user reported that arbitrary command names like "ON_OPENINGj" must
  // pass through unchanged.
  const arrangement: ProgramArrangement = {
    ...sampleProgramArrangement,
    items: [
      {
        ...sampleProgramArrangement.items[0]!,
        mqttCommand: "ON_OPENINGj",
      },
    ],
  };
  const ino = generateFullOnlineMqttIno(BASE, arrangement);
  check("Verbatim mqttCommand 'ON_OPENINGj' is preserved", ino.includes(`messageTemp == "ON_OPENINGj"`));
  check("Original 'ON_OPENING' (without trailing j) does NOT appear", !/messageTemp == "ON_OPENING"(?!j)/.test(ino));
}

console.log("\n=== Bug 2: duplicate section names get unique suffixes ===");
{
  const dance: DanceProject = {
    schemaVersion: 1,
    type: "led-dance",
    id: "dance-newdance",
    name: "New Dance",
    bpm: 120,
    beatUnit: 0.5,
    dancers: [{ id: 1, name: "A" }],
    customAnimations: [],
    sections: [
      {
        id: "s1",
        name: "New Section",
        steps: [
          { id: "s1-1", durationBeats: 1, clearBefore: false, actions: [] },
        ],
      },
      {
        id: "s2",
        name: "New Section", // duplicate name
        steps: [
          { id: "s2-1", durationBeats: 1, clearBefore: false, actions: [] },
        ],
      },
    ],
  };
  const arrangement: ProgramArrangement = {
    schemaVersion: 1,
    type: "led-program",
    id: "p",
    name: "Dup Section Test",
    items: [{ id: "i1", danceId: dance.id, mqttCommand: "ON_DUP", dance }],
  };

  const ino = generateFullOnlineMqttIno(BASE, arrangement);

  const suffixedDecl1 = /void\s+playNewDance_NewSection_1\s*\(\s*\)\s*;/.test(ino);
  const suffixedDecl2 = /void\s+playNewDance_NewSection_2\s*\(\s*\)\s*;/.test(ino);
  const suffixedDef1 = /void\s+playNewDance_NewSection_1\s*\(\s*\)\s*\{/.test(ino);
  const suffixedDef2 = /void\s+playNewDance_NewSection_2\s*\(\s*\)\s*\{/.test(ino);
  check("Forward decl playNewDance_NewSection_1 exists", suffixedDecl1);
  check("Forward decl playNewDance_NewSection_2 exists", suffixedDecl2);
  check("Definition playNewDance_NewSection_1 exists", suffixedDef1);
  check("Definition playNewDance_NewSection_2 exists", suffixedDef2);
  check(
    "No bare playNewDance_NewSection() (without suffix) is ever defined",
    !/void\s+playNewDance_NewSection\s*\(\s*\)\s*\{/.test(ino),
  );

  const fwdDeclMatches = ino.match(/void\s+playNewDance_NewSection(?:_\d+)?\s*\(\s*\)\s*;/g) ?? [];
  const defMatches = ino.match(/void\s+playNewDance_NewSection(?:_\d+)?\s*\(\s*\)\s*\{/g) ?? [];
  check(`Exactly 2 forward declarations, 2 definitions (got ${fwdDeclMatches.length} / ${defMatches.length})`, fwdDeclMatches.length === 2 && defMatches.length === 2);

  // Verify the dance function calls the suffixed names, not bare "playNewDance_NewSection()"
  const danceFnRange = findFunctionBody(ino, /void\s+danceNewDance\s*\(\s*\)\s*\{/);
  const danceFnBody = danceFnRange ? ino.slice(danceFnRange.bodyStart, danceFnRange.bodyEnd) : "";
  check(
    "danceNewDance() body calls suffixed section function names",
    /playNewDance_NewSection_1\(\);[\s\S]*playNewDance_NewSection_2\(\);/.test(danceFnBody),
  );
}

console.log("\n=== Bug 4: clearBefore=false does NOT auto-add fill_solid ===");
{
  const dance: DanceProject = {
    schemaVersion: 1,
    type: "led-dance",
    id: "dance-keepstate",
    name: "Keep State",
    bpm: 120,
    beatUnit: 0.5,
    dancers: [{ id: 1, name: "A" }],
    customAnimations: [],
    sections: [
      {
        id: "s",
        name: "Only",
        steps: [
          {
            id: "step-clear",
            durationBeats: 1,
            clearBefore: true,
            actions: [],
          },
          {
            id: "step-noclear",
            durationBeats: 1,
            clearBefore: false, // explicitly off — must NOT emit fill_solid
            actions: [],
          },
        ],
      },
    ],
  };
  const arrangement: ProgramArrangement = {
    schemaVersion: 1,
    type: "led-program",
    id: "p",
    name: "Keep state",
    items: [{ id: "i", danceId: dance.id, mqttCommand: "ON_KEEP", dance }],
  };
  const ino = generateFullOnlineMqttIno(BASE, arrangement);

  // Pull out the body of playKeepState_Only and inspect each step block.
  const sectionRange = findFunctionBody(ino, /void\s+playKeepState_Only\s*\(\s*\)\s*\{/);
  const sectionBody = sectionRange ? ino.slice(sectionRange.bodyStart, sectionRange.bodyEnd) : "";
  const clearBlock = sectionBody.slice(sectionBody.indexOf("Step step-clear"), sectionBody.indexOf("Step step-noclear"));
  const noClearBlock = sectionBody.slice(sectionBody.indexOf("Step step-noclear"));

  check("step with clearBefore=true emits fill_solid(...)", clearBlock.includes("fill_solid(leds, NUM_LEDS, CRGB::Black);"));
  check("step with clearBefore=false does NOT emit fill_solid(...)", !noClearBlock.includes("fill_solid(leds, NUM_LEDS, CRGB::Black);"));
}

console.log("\n=== Compile-safety: validateGeneratedIno catches misplaced MQTT block ===");
{
  // Hand-craft an .ino that puts the MQTT marker inside a struct (the actual
  // bug we just fixed). validateGeneratedIno should reject it.
  const broken = [
    "void callback(char* topic, byte* message, unsigned int length) {",
    "  // empty body",
    "}",
    "",
    "struct LedRange {",
    "// === GENERATED MQTT BRANCHES START ===",
    "  else if (messageTemp == \"X\") {}",
    "// === GENERATED MQTT BRANCHES END ===",
    "};",
  ].join("\n");

  let threw = false;
  try {
    validateGeneratedIno(broken);
  } catch (e) {
    threw = (e instanceof Error ? e.message : String(e)).includes("outside callback()");
  }
  check("validateGeneratedIno throws when MQTT block is outside callback()", threw);

  // Duplicate function names too.
  const dup = [
    "void foo() {}",
    "void foo() {}",
  ].join("\n");
  let dupThrew = false;
  try {
    validateGeneratedIno(dup);
  } catch (e) {
    dupThrew = (e instanceof Error ? e.message : String(e)).includes("more than once");
  }
  check("validateGeneratedIno throws on duplicate function definitions", dupThrew);
}

console.log("\n=== Full Offline .ino — minimal mode (default) ===");
{
  const ino = generateFullOfflineIno(BASE, sampleProgramArrangement);

  check("defines OFFLINE_TEST = 1", /^#define\s+OFFLINE_TEST\s+1\b/m.test(ino));
  check("DANCER forced to 1", /\bconst\s+int\s+DANCER\s*=\s*1\s*;/.test(ino));
  check("contains timelineDelaySafe helper", ino.includes("void timelineDelaySafe(unsigned long interval)"));
  check("contains offlineTest() function", /void\s+offlineTest\s*\(\s*\)\s*\{/.test(ino));
  check("offlineTest() calls the generated dance", /void\s+offlineTest[\s\S]*?danceSampleDance\(\);/.test(ino));

  // Minimal mode replaces setup/loop with canonical bodies — they already
  // contain the OFFLINE_TEST guards; no marker-based patch needed.
  check("setup() guards setup_wifi() with #if !OFFLINE_TEST", /#if\s+!OFFLINE_TEST[\s\S]*?setup_wifi\(\);[\s\S]*?#endif/.test(ino));
  check("setup() ends with #if OFFLINE_TEST offlineTest()", /#if\s+OFFLINE_TEST[\s\S]*?offlineTest\(\);[\s\S]*?#endif/.test(ino));
  check("loop() body wrapped in #if !OFFLINE_TEST", /void\s+loop\s*\(\s*\)\s*\{\s*\n#if\s+!OFFLINE_TEST/.test(ino));

  // Animation while-loop in offline mode does NOT call client.loop()
  const stripComments = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const offlineDanceBlock = ino.slice(ino.indexOf("// === GENERATED LED DANCE CODE START ==="));
  check(
    "generated dance code has no client.loop() in offline mode",
    !stripComments(offlineDanceBlock).includes("client.loop()"),
  );

  // Idempotency
  const ino2 = generateFullOfflineIno(ino, sampleProgramArrangement);
  check("re-export is idempotent (offline → offline)", ino === ino2);
}

console.log("\n=== includeLegacyExampleDances=true uses from-template mode ===");
{
  const ino = generateFullOnlineMqttIno(BASE, sampleProgramArrangement, {
    includeLegacyExampleDances: true,
  });
  // Legacy songs preserved.
  check("from-template mode preserves danceWhatMYB", /\bvoid\s+danceWhatMYB\s*\(\s*\)\s*\{/.test(ino));
  check("from-template mode preserves setupPart_LTDO", /\bvoid\s+setupPart_LTDO\s*\(/.test(ino));
  check("from-template mode preserves COLORSET_3_1_1", /\bCOLORSET_3_1_1\b/.test(ino));
  // Generated content still inserted.
  check("from-template mode still inserts forward decls", ino.includes("// === GENERATED LED DANCE FORWARD DECLS START ==="));
  check("from-template mode still inserts MQTT branches", ino.includes("// === GENERATED MQTT BRANCHES START ==="));
}

console.log("\n=== Defensive errors ===");
{
  let threw = false;
  try {
    generateFullOfflineIno("// no setup, no callback, no loop", sampleProgramArrangement);
  } catch (e) {
    threw = e instanceof Error && (e.message.includes("setup") || e.message.includes("anchor"));
  }
  check("throws clearly when base .ino is missing required functions", threw);

  threw = false;
  try {
    insertMqttBranches("void other() {}", "else if (...) {}");
  } catch (e) {
    threw = (e instanceof Error ? e.message : String(e)).includes("callback");
  }
  check("insertMqttBranches throws when callback() is missing", threw);

  threw = false;
  try {
    const minimal = "void setup() {\n  Serial.begin(115200);\n}\nvoid loop() {}";
    patchSetupForOffline(minimal);
  } catch (e) {
    threw = (e instanceof Error ? e.message : String(e)).includes("WiFi/MQTT initialisation");
  }
  check("patchSetupForOffline throws when WiFi calls are missing", threw);

  threw = false;
  try {
    patchLoopForOffline("void notLoop() {}");
  } catch (e) {
    threw = (e instanceof Error ? e.message : String(e)).includes("loop()");
  }
  check("patchLoopForOffline throws when loop() is missing", threw);
}

console.log("\n=== ExportSettings: hardware globals propagate into base .ino ===");
{
  const ino = generateFullOnlineMqttIno(BASE, sampleProgramArrangement, {
    wifiSsid: "MyDeviceNet",
    wifiPassword: "s3cr3t!\\\"",
    mqttHost: "10.0.0.42",
    mqttPort: 8883,
    mqttTopic: "DANCE/CTRL",
    mqttClientIdPrefix: "FloorChip_",
    dancerId: 4,
    personId: 5,
    roleId: 6,
    ledPin: 27,
    numLeds: 750,
    brightness: 32,
    ledType: "WS2811",
    colorOrder: "RGB",
  });

  check("WiFi ssid was rewritten",       /const\s+char\*\s+ssid\s*=\s*"MyDeviceNet"/.test(ino));
  check("WiFi password was rewritten",   /const\s+char\*\s+password\s*=\s*"s3cr3t!\\\\\\"\"/.test(ino));
  check("MQTT host was rewritten",       /const\s+char\*\s+mqtt_server\s*=\s*"10\.0\.0\.42"/.test(ino));
  check("MQTT topic was rewritten",      /const\s+char\*\s+mqtt_topic\s*=\s*"DANCE\/CTRL"/.test(ino));
  check("mqtt_port global was added",    /const\s+int\s+mqtt_port\s*=\s*8883\s*;/.test(ino));
  check("client.setServer uses mqtt_port", /client\.setServer\(mqtt_server,\s*mqtt_port\)/.test(ino));
  check("clientId prefix replaced",      /String\s+clientId\s*=\s*"FloorChip_"/.test(ino));
  check("DANCER set to 4",               /\bconst\s+int\s+DANCER\s*=\s*4\s*;/.test(ino));
  check("PERSON set to 5",               /^#define\s+PERSON\s+5\b/m.test(ino));
  check("ROLE set to 6",                 /^#define\s+ROLE\s+6\b/m.test(ino));
  check("LED_PIN set to 27",             /^#define\s+LED_PIN\s+27\b/m.test(ino));
  check("NUM_LEDS set to 750",           /^#define\s+NUM_LEDS\s+750\b/m.test(ino));
  check("BRIGHTNESS set to 32",          /^#define\s+BRIGHTNESS\s+32\b/m.test(ino));
  check("LED_TYPE set to WS2811",        /^#define\s+LED_TYPE\s+WS2811\b/m.test(ino));
  check("COLOR_ORDER set to RGB",        /^#define\s+COLOR_ORDER\s+RGB\b/m.test(ino));
}

console.log("\n=== ExportSettings: hooks toggle showReadySignal / showEndSignal in MQTT branches ===");
{
  const inoOff = generateFullOnlineMqttIno(BASE, sampleProgramArrangement, {
    showReadySignalBeforeDance: false,
    showEndSignalAfterDance: false,
  });
  // Find the generated MQTT branch and confirm hooks are absent.
  const startIdx = inoOff.indexOf("// === GENERATED MQTT BRANCHES START ===");
  const endIdx = inoOff.indexOf("// === GENERATED MQTT BRANCHES END ===");
  const block = inoOff.slice(startIdx, endIdx);
  check("Hooks off → no showReadySignal() in MQTT branch", !block.includes("showReadySignal();"));
  check("Hooks off → no showEndSignal() in MQTT branch",   !block.includes("showEndSignal();"));

  const inoOn = generateFullOnlineMqttIno(BASE, sampleProgramArrangement, {
    showReadySignalBeforeDance: true,
    showEndSignalAfterDance: true,
  });
  const onStart = inoOn.indexOf("// === GENERATED MQTT BRANCHES START ===");
  const onEnd = inoOn.indexOf("// === GENERATED MQTT BRANCHES END ===");
  const onBlock = inoOn.slice(onStart, onEnd);
  check("Hooks on → showReadySignal() in MQTT branch", onBlock.includes("showReadySignal();"));
  check("Hooks on → showEndSignal() in MQTT branch",   onBlock.includes("showEndSignal();"));
}

console.log("\n=== ExportSettings: offlineRunMode shapes offlineTest() ===");
{
  // runArrangementOnce: linear calls
  const inoOnce = generateFullOfflineIno(BASE, sampleProgramArrangement, {
    offlineRunMode: "runArrangementOnce",
  });
  const offlineFnRange = /void\s+offlineTest\s*\(\s*\)\s*\{[\s\S]*?\n\}/.exec(inoOnce);
  const onceBody = offlineFnRange?.[0] ?? "";
  check("runArrangementOnce: contains startTimeline()", onceBody.includes("startTimeline();"));
  check("runArrangementOnce: NO while loop wrapper",    !/while\s*\(/.test(onceBody));
  check("runArrangementOnce: calls dance directly",     /danceSampleDance\(\);/.test(onceBody));

  // loopArrangement: while loop
  const inoLoop = generateFullOfflineIno(BASE, sampleProgramArrangement, {
    offlineRunMode: "loopArrangement",
  });
  const loopBody = (/void\s+offlineTest\s*\(\s*\)\s*\{[\s\S]*?\n\}/.exec(inoLoop) ?? [""])[0];
  check("loopArrangement: contains while (danceRunning)", /while\s*\(\s*danceRunning\s*\)/.test(loopBody));
  check("loopArrangement: contains delay(1000)",          /delay\(1000\)/.test(loopBody));

  // runSelectedDance + missing id throws
  let threw = false;
  try {
    generateFullOfflineIno(BASE, sampleProgramArrangement, {
      offlineRunMode: "runSelectedDance",
    });
  } catch (e) {
    threw = (e instanceof Error ? e.message : String(e)).includes("offlineSelectedDanceId");
  }
  check("runSelectedDance without offlineSelectedDanceId throws", threw);

  // runSelectedDance + valid id, no loop
  const inoSel = generateFullOfflineIno(BASE, sampleProgramArrangement, {
    offlineRunMode: "runSelectedDance",
    offlineSelectedDanceId: sampleProgramArrangement.items[0]!.danceId,
    loopAfterFinish: false,
  });
  const selBody = (/void\s+offlineTest\s*\(\s*\)\s*\{[\s\S]*?\n\}/.exec(inoSel) ?? [""])[0];
  check("runSelectedDance: calls only the selected dance", /danceSampleDance\(\);/.test(selBody));
  check("runSelectedDance + loopAfterFinish=false: no while loop", !/while\s*\(/.test(selBody));

  // runSelectedDance + loop
  const inoSelLoop = generateFullOfflineIno(BASE, sampleProgramArrangement, {
    offlineRunMode: "runSelectedDance",
    offlineSelectedDanceId: sampleProgramArrangement.items[0]!.danceId,
    loopAfterFinish: true,
  });
  const selLoopBody = (/void\s+offlineTest\s*\(\s*\)\s*\{[\s\S]*?\n\}/.exec(inoSelLoop) ?? [""])[0];
  check("runSelectedDance + loopAfterFinish=true: wraps in while loop", /while\s*\(\s*danceRunning\s*\)/.test(selLoopBody));

  // runSelectedDance + bad id throws
  threw = false;
  try {
    generateFullOfflineIno(BASE, sampleProgramArrangement, {
      offlineRunMode: "runSelectedDance",
      offlineSelectedDanceId: "no-such-dance",
    });
  } catch (e) {
    threw = (e instanceof Error ? e.message : String(e)).includes("not found in arrangement");
  }
  check("runSelectedDance with unknown id throws", threw);
}

console.log("\n=== generateFullIno top-level dispatcher ===");
{
  const settings = {
    ...defaultExportSettings(),
    exportType: "snippet" as const,
  };
  const snippet = generateFullIno(sampleProgramArrangement, settings);
  check("snippet via dispatcher",        snippet.includes("// --- Forward declarations"));

  const offlineSettings = { ...defaultExportSettings(), exportType: "full-offline-ino" as const };
  const offlineIno = generateFullIno(sampleProgramArrangement, offlineSettings, BASE);
  check("full-offline via dispatcher",   /^#define\s+OFFLINE_TEST\s+1\b/m.test(offlineIno));

  const onlineSettings = { ...defaultExportSettings(), exportType: "full-online-mqtt-ino" as const };
  const onlineIno = generateFullIno(sampleProgramArrangement, onlineSettings, BASE);
  check("full-online via dispatcher",    onlineIno.includes("// === GENERATED MQTT BRANCHES START ==="));

  let threw = false;
  try {
    generateFullIno(sampleProgramArrangement, offlineSettings);
  } catch (e) {
    threw = (e instanceof Error ? e.message : String(e)).includes("baseInoSource is required");
  }
  check("dispatcher throws when full export missing baseInoSource", threw);
}

console.log(`\n${passes}/${passes + failures} passed${failures > 0 ? ` (${failures} failed)` : ""}`);
process.exit(failures > 0 ? 1 : 0);
