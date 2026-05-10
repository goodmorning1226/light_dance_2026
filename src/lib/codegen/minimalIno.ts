// Helpers for the "full minimal" .ino export mode (the default when
// `includeLegacyExampleDances` is false). Strips the legacy demo songs out of
// the base .ino and replaces setup() / callback() / loop() with canonical
// minimal bodies that only know how to drive the user-edited dances.

import type { ExportMode, ExportSettings } from "@/types";
import { findFunctionBody, MQTT_END, MQTT_START } from "./insertion";

// ===== Hardware / connection settings: rewrite the .ino's globals =====

function escapeStringLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Rewrites WiFi/MQTT/LED globals + costume identity in the base .ino to
// match `settings`. Idempotent: re-running with the same settings is a no-op,
// re-running with new settings overwrites the previous values.
//
// Also adds a `const int mqtt_port` global (if missing) and patches any
// hardcoded `client.setServer(mqtt_server, 1883)` to use that global.
export function applyHardwareSettings(base: string, s: ExportSettings): string {
  let result = base;

  // WiFi
  result = result.replace(
    /^(\s*const\s+char\*\s+ssid\s*=\s*)"[^"]*"(\s*;.*)$/m,
    `$1"${escapeStringLiteral(s.wifiSsid)}"$2`,
  );
  result = result.replace(
    /^(\s*const\s+char\*\s+password\s*=\s*)"[^"]*"(\s*;.*)$/m,
    `$1"${escapeStringLiteral(s.wifiPassword)}"$2`,
  );

  // MQTT host + topic
  result = result.replace(
    /^(\s*const\s+char\*\s+mqtt_server\s*=\s*)"[^"]*"(\s*;.*)$/m,
    `$1"${escapeStringLiteral(s.mqttHost)}"$2`,
  );
  result = result.replace(
    /^(\s*const\s+char\*\s+mqtt_topic\s*=\s*)"[^"]*"(\s*;.*)$/m,
    `$1"${escapeStringLiteral(s.mqttTopic)}"$2`,
  );

  // mqtt_port: insert if missing, otherwise update value
  if (/\bconst\s+int\s+mqtt_port\b/.test(result)) {
    result = result.replace(
      /^(\s*const\s+int\s+mqtt_port\s*=\s*)\d+(\s*;.*)$/m,
      `$1${s.mqttPort}$2`,
    );
  } else {
    result = result.replace(
      /^(\s*const\s+char\*\s+mqtt_server\s*=\s*"[^"]*"\s*;.*\n)/m,
      `$1const int mqtt_port = ${s.mqttPort};\n`,
    );
  }

  // Use mqtt_port instead of any hardcoded literal in client.setServer
  result = result.replace(
    /client\.setServer\(\s*mqtt_server\s*,\s*\d+\s*\)/g,
    `client.setServer(mqtt_server, mqtt_port)`,
  );

  // MQTT client id prefix in reconnect()
  result = result.replace(
    /(String\s+clientId\s*=\s*)"[^"]*"(\s*\+\s*String\(random)/m,
    `$1"${escapeStringLiteral(s.mqttClientIdPrefix)}"$2`,
  );

  // Costume identity
  result = result.replace(
    /^(\s*const\s+int\s+DANCER\s*=\s*)-?\d+(\s*;.*)$/m,
    `$1${s.dancerId}$2`,
  );
  result = result.replace(
    /^(\s*#define\s+PERSON\s+)-?\d+(.*)$/m,
    `$1${s.personId}$2`,
  );
  result = result.replace(
    /^(\s*#define\s+ROLE\s+)-?\d+(.*)$/m,
    `$1${s.roleId}$2`,
  );

  // LED hardware
  result = result.replace(
    /^(\s*#define\s+LED_PIN\s+)\d+(.*)$/m,
    `$1${s.ledPin}$2`,
  );
  result = result.replace(
    /^(\s*#define\s+NUM_LEDS\s+)\d+(.*)$/m,
    `$1${s.numLeds}$2`,
  );
  result = result.replace(
    /^(\s*#define\s+BRIGHTNESS\s+)\d+(.*)$/m,
    `$1${s.brightness}$2`,
  );
  result = result.replace(
    /^(\s*#define\s+LED_TYPE\s+)\w+(.*)$/m,
    `$1${s.ledType}$2`,
  );
  result = result.replace(
    /^(\s*#define\s+COLOR_ORDER\s+)\w+(.*)$/m,
    `$1${s.colorOrder}$2`,
  );

  return result;
}

// ===== Minimal canonical bodies =====

export function generateMinimalSetupBody(exportMode: ExportMode): string {
  if (exportMode === "online") {
    return [
      "    Serial.begin(115200);",
      "",
      "    setup_wifi();",
      "    client.setServer(mqtt_server, mqtt_port);",
      "    client.setCallback(callback);",
      "",
      "    FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS);",
      "    FastLED.setBrightness(BRIGHTNESS);",
      "    FastLED.clear();",
      "    FastLED.show();",
      "",
      `    Serial.println("Device ready, waiting for MQTT commands...");`,
      "    initializeLedRangeStarts();",
    ].join("\n");
  }
  return [
    "    Serial.begin(115200);",
    "",
    "#if !OFFLINE_TEST",
    "    setup_wifi();",
    "    client.setServer(mqtt_server, mqtt_port);",
    "    client.setCallback(callback);",
    "#endif",
    "",
    "    FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS);",
    "    FastLED.setBrightness(BRIGHTNESS);",
    "    FastLED.clear();",
    "    FastLED.show();",
    "",
    `    Serial.println("Device ready");`,
    "    initializeLedRangeStarts();",
    "",
    "#if OFFLINE_TEST",
    "    delay(2000);",
    "    offlineTest();",
    "#endif",
  ].join("\n");
}

export function generateMinimalLoopBody(exportMode: ExportMode): string {
  const inner = [
    "    if (!client.connected()) {",
    "        reconnect();",
    "    }",
    "    client.loop();",
  ];
  if (exportMode === "online") return inner.join("\n");
  return ["#if !OFFLINE_TEST", ...inner, "#endif"].join("\n");
}

export function generateMinimalCallbackBody(mqttBranches: string): string {
  const indented = mqttBranches
    .split("\n")
    .map((l) => (l.length > 0 ? `    ${l}` : l))
    .join("\n");
  return [
    `    Serial.print("MQTT message: ");`,
    "    String messageTemp;",
    "    for (int i = 0; i < length; i++) {",
    "        messageTemp += (char)message[i];",
    "    }",
    "    Serial.println(messageTemp);",
    "",
    `    if (messageTemp == "OFF") {`,
    `        Serial.println("Stopping LED show...");`,
    "        danceRunning = false;",
    "        stopEffect();",
    "    }",
    `    else if (messageTemp == "READY") {`,
    `        Serial.println("Showing ready signal...");`,
    "        showReadySignal();",
    "    }",
    `    else if (messageTemp == "TEST") {`,
    `        Serial.println("Simple LED test (white)");`,
    "        fill_solid(leds, NUM_LEDS, CRGB::White);",
    "        FastLED.show();",
    "    }",
    `    ${MQTT_START} (inserted inside callback() if/else-if chain)`,
    indented,
    `    ${MQTT_END}`,
  ].join("\n");
}

export function replaceFunctionBody(
  source: string,
  signaturePattern: RegExp,
  newBody: string,
  fnLabel: string,
): string {
  const range = findFunctionBody(source, signaturePattern);
  if (!range) {
    throw new Error(
      `Cannot find ${fnLabel}() body in base .ino. Aborting full minimal export to avoid producing a broken .ino.`,
    );
  }
  return source.slice(0, range.bodyStart) + "\n" + newBody + "\n" + source.slice(range.bodyEnd);
}

// ===== Legacy stripping =====

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeFunctionDefinition(source: string, signaturePattern: RegExp): string {
  const range = findFunctionBody(source, signaturePattern);
  if (!range) return source;
  let removeEnd = range.bodyEnd + 1;
  if (source[removeEnd] === ";") removeEnd++;
  if (source[removeEnd] === "\n") removeEnd++;
  return source.slice(0, range.sigStart) + source.slice(removeEnd);
}

function removeStructDefinition(source: string, signaturePattern: RegExp): string {
  const range = findFunctionBody(source, signaturePattern);
  if (!range) return source;
  let removeEnd = range.bodyEnd + 1;
  while (removeEnd < source.length && source[removeEnd] === " ") removeEnd++;
  if (source[removeEnd] === ";") removeEnd++;
  if (source[removeEnd] === "\n") removeEnd++;
  return source.slice(0, range.sigStart) + source.slice(removeEnd);
}

export function stripLegacyExampleSongs(base: string): string {
  let working = base;

  working = working.replace(
    /#pragma region What Makes You Beautiful Actions[\s\S]*?#pragma endregion\s*\n?/g,
    "",
  );

  for (const sig of [
    /\bvoid\s+danceWhatMYB\s*\(\s*\)\s*\{/,
    /\bvoid\s+setupPart_LTDO\s*\(\s*int[^)]*\)\s*\{/,
    /\bvoid\s+setupPart_shutUAD\s*\(\s*int[^)]*\)\s*\{/,
    /\bvoid\s+runAllAnimations\s*\(\s*\)\s*\{/,
    /\bColorSet\s+whiteAndColorSet\s*\(\s*CRGB[^)]*\)\s*\{/,
    /std::vector<Animation>\s+LEFT_TO_RIGHT\s*\([^)]*\)\s*\{/,
  ]) {
    working = removeFunctionDefinition(working, sig);
  }

  const legacyDecls = [
    "void setupPart_LTDO(int partNumber);",
    "void setupPart_shutUAD(int partNumber);",
    "void runAllAnimations();",
    "void danceWhatMYB();",
    "void playIntro();",
    "void playMain1();",
    "void playMain5();",
    "void playMain9();",
    "void playMain13();",
    "void playMain17();",
    "void playMain21();",
    "void playMain25();",
    "void playMain29();",
  ];
  for (const decl of legacyDecls) {
    working = working.replace(new RegExp(`^${escapeRegExp(decl)}\\s*\\n`, "m"), "");
  }

  working = removeStructDefinition(working, /\bstruct\s+PlayStep\s*\{/);

  working = working.replace(/^[ \t]*int\s+totalSteps\s*=\s*0\s*;.*\n/m, "");
  working = working.replace(/^[ \t]*int\s+stepIndex\s*=\s*0\s*;.*\n/m, "");
  working = working.replace(/^[ \t]*int\s+secondSongIndex\s*=\s*0\s*;.*\n/m, "");
  working = working.replace(/^[ \t]*Animation\s+anim\s*;.*\n/m, "");
  working = working.replace(/^[ \t]*std::vector<PlayStep>\s+sequence\s*;.*\n/m, "");

  working = working.replace(/^#define\s+[A-Z][A-Z0-9_]*\s+CRGB\([^)]+\).*\n/gm, "");

  working = working.replace(
    /^[ \t]*const\s+ColorSet\s+COLORSET_[A-Za-z0-9_]+\s*=\s*\[\]\(\)\s*\{[\s\S]*?\}\s*\(\)\s*;\s*\n/gm,
    "",
  );

  return working;
}
