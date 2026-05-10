// End-to-end contract verification:
// reads light_dance_2026.ino, generates C++ from sample data, and asserts the
// output respects the Codebase Contract from Step 1.

import * as fs from "node:fs";
import * as path from "node:path";
import { BODY_PART_NAMES, BUILT_IN_ANIMATION_IDS } from "@/types";
import {
  sampleDanceProject,
  sampleProgramArrangement,
} from "@/data";
import {
  exportDanceToJson,
  exportProgramToJson,
  importDanceFromJson,
  importProgramFromJson,
} from "@/lib/io";
import {
  durationToCppExpression,
  generateDanceCpp,
  generateProgramCpp,
  sanitizeCppIdentifier,
} from "@/lib/codegen";

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

const INO_PATH = path.join(process.cwd(), "light_dance_2026.ino");
if (!fs.existsSync(INO_PATH)) {
  console.error(`light_dance_2026.ino not found at ${INO_PATH}`);
  process.exit(2);
}
const ino = fs.readFileSync(INO_PATH, "utf8");

console.log("\n=== 2. BodyPartName matches BodyPart declarations in .ino ===");
{
  const declared = new Set<string>();
  for (const m of ino.matchAll(/^BodyPart\s+(\w+)\s*;\s*$/gm)) {
    if (m[1]) declared.add(m[1]);
  }
  check(`.ino declares ${declared.size} BodyPart variables (expected ≥ ${BODY_PART_NAMES.length})`, declared.size >= BODY_PART_NAMES.length);
  const missing: string[] = [];
  for (const name of BODY_PART_NAMES) {
    if (!declared.has(name)) missing.push(name);
  }
  check(
    `Every BodyPartName has a matching .ino declaration`,
    missing.length === 0,
    missing.length > 0 ? `Missing in .ino: ${missing.join(", ")}` : undefined,
  );
}

console.log("\n=== 3. BuiltInAnimationId maps to Animation::* in .ino ===");
{
  for (const id of BUILT_IN_ANIMATION_IDS) {
    const re = new RegExp(`Animation::${id}\\b`);
    check(`Animation::${id} is referenced in .ino`, re.test(ino));
  }
}

console.log("\n=== 4. Dance JSON round-trip ===");
{
  const json = exportDanceToJson(sampleDanceProject);
  const back = importDanceFromJson(json);
  check("Dance round-trip preserves name", back.name === sampleDanceProject.name);
  check("Dance round-trip preserves bpm", back.bpm === sampleDanceProject.bpm);
  check("Dance round-trip preserves dancers count", back.dancers.length === sampleDanceProject.dancers.length);
  check("Dance round-trip preserves sections count", back.sections.length === sampleDanceProject.sections.length);
  check("Dance round-trip preserves first action color", back.sections[0]?.steps[0]?.actions[0]?.color.r === sampleDanceProject.sections[0]?.steps[0]?.actions[0]?.color.r);
}

console.log("\n=== 5. Program JSON round-trip ===");
{
  const json = exportProgramToJson(sampleProgramArrangement);
  const back = importProgramFromJson(json);
  check("Program round-trip preserves items", back.items.length === sampleProgramArrangement.items.length);
  check("Program round-trip preserves mqttCommand", back.items[0]?.mqttCommand === sampleProgramArrangement.items[0]?.mqttCommand);
  check("Program round-trip embeds dance.id", back.items[0]?.dance?.id === sampleProgramArrangement.items[0]?.dance?.id);
}

// Strip line + block comments so comment text mentioning client.loop doesn't
// trigger false positives in the next checks.
function stripCppComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

console.log("\n=== 6. Offline C++ does not depend on WiFi / MQTT ===");
{
  const off = generateProgramCpp(sampleProgramArrangement, "offline");
  const stripped = stripCppComments(off);
  check("Offline C++ has no client.loop()", !stripped.includes("client.loop()"));
  check("Offline C++ has no setup_wifi(", !stripped.includes("setup_wifi("));
  check("Offline C++ has no reconnect(", !stripped.includes("reconnect("));
  check("Offline C++ provides timelineDelaySafe()", off.includes("void timelineDelaySafe("));
  check("Offline C++ provides offlineTest()", off.includes("void offlineTest()"));
  check("Offline C++ defines OFFLINE_TEST", off.includes("#define OFFLINE_TEST 1"));
  check("Offline C++ does NOT use the MQTT-style timelineDelay()", !/(?<![A-Za-z])timelineDelay\(/.test(stripped));
}

console.log("\n=== 7. Online MQTT C++ exposes a callback snippet ===");
{
  const on = generateProgramCpp(sampleProgramArrangement, "online");
  check("Online C++ emits the MQTT callback section", on.includes("MQTT callback snippet"));
  for (const item of sampleProgramArrangement.items) {
    check(
      `Online callback contains else-if for "${item.mqttCommand}"`,
      on.includes(`messageTemp == "${item.mqttCommand}"`),
    );
  }
  check("Online C++ uses timelineDelay() (not Safe variant)", on.includes("timelineDelay(") && !on.includes("timelineDelaySafe("));
  check("Online animation loop calls client.loop()", on.includes("client.loop();"));
}

console.log("\n=== 8. Codegen does NOT redefine .ino library symbols ===");
{
  const all = [
    generateProgramCpp(sampleProgramArrangement, "offline"),
    generateProgramCpp(sampleProgramArrangement, "online"),
  ].join("\n");
  const stripped = stripCppComments(all);
  const forbidden: { label: string; pattern: RegExp }[] = [
    { label: "#define LED_PIN", pattern: /#define\s+LED_PIN\b/ },
    { label: "#define NUM_LEDS", pattern: /#define\s+NUM_LEDS\b/ },
    { label: "#define BRIGHTNESS", pattern: /#define\s+BRIGHTNESS\b/ },
    { label: "#define LED_TYPE", pattern: /#define\s+LED_TYPE\b/ },
    { label: "#define COLOR_ORDER", pattern: /#define\s+COLOR_ORDER\b/ },
    { label: "struct BodyPart", pattern: /\bstruct\s+BodyPart\b/ },
    { label: "struct LedRange", pattern: /\bstruct\s+LedRange\b/ },
    { label: "struct ColorSet", pattern: /\bstruct\s+ColorSet\b/ },
    { label: "struct Animation", pattern: /\bstruct\s+Animation\b/ },
    { label: "class Animation", pattern: /\bclass\s+Animation\b/ },
    { label: "void fillBodyPart(", pattern: /\bvoid\s+fillBodyPart\s*\(/ },
    { label: "void fillColorSet(", pattern: /\bvoid\s+fillColorSet\s*\(/ },
    { label: "void setup_wifi(", pattern: /\bvoid\s+setup_wifi\s*\(/ },
    { label: "void reconnect(", pattern: /\bvoid\s+reconnect\s*\(/ },
    { label: "void callback(char*", pattern: /\bvoid\s+callback\s*\(\s*char\*/ },
    { label: "void setup()", pattern: /\bvoid\s+setup\s*\(\s*\)/ },
    { label: "void loop()", pattern: /\bvoid\s+loop\s*\(\s*\)/ },
  ];
  for (const f of forbidden) {
    check(`Generated code does NOT redefine ${f.label}`, !f.pattern.test(stripped));
  }
}

console.log("\n=== 9. Generated function names are valid C++ identifiers ===");
{
  check(`sanitize "什麼歌" → "Dance"`, sanitizeCppIdentifier("什麼歌") === "Dance");
  check(`sanitize "3rd Song" prefixes Dance_`, sanitizeCppIdentifier("3rd Song").startsWith("Dance_"));
  check(`sanitize "What Makes You Beautiful" preserves case`, sanitizeCppIdentifier("What Makes You Beautiful") === "WhatMakesYouBeautiful");
  check(`sanitize "Shut Up & Dance" strips &`, sanitizeCppIdentifier("Shut Up & Dance") === "ShutUpDance");

  const cnDance = { ...sampleDanceProject, name: "什麼歌" };
  const cpp = generateDanceCpp(cnDance, "online");
  check(`Generated function from "什麼歌" is a valid C++ identifier`, /\bvoid\s+danceDance\s*\(/.test(cpp));

  const allIdentifiers = [...generateProgramCpp(sampleProgramArrangement, "online").matchAll(/\bvoid\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]!);
  const valid = allIdentifiers.every((id) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(id));
  check(`All generated function names are valid C++ identifiers (${allIdentifiers.length} total)`, valid);
}

console.log("\n=== 10. duration expression matches Codebase Contract ===");
{
  check("0.25 → BEAT_TIME / 4", durationToCppExpression(0.25, "BEAT_TIME") === "BEAT_TIME / 4");
  check("0.5 → BEAT_TIME / 2", durationToCppExpression(0.5, "BEAT_TIME") === "BEAT_TIME / 2");
  check("1 → BEAT_TIME", durationToCppExpression(1, "BEAT_TIME") === "BEAT_TIME");
  check("2 → 2 * BEAT_TIME", durationToCppExpression(2, "BEAT_TIME") === "2 * BEAT_TIME");
  check("4 → 4 * BEAT_TIME", durationToCppExpression(4, "BEAT_TIME") === "4 * BEAT_TIME");
  // Spec extension: integer N
  check("3 → 3 * BEAT_TIME", durationToCppExpression(3, "BEAT_TIME") === "3 * BEAT_TIME");
  check("8 → 8 * BEAT_TIME", durationToCppExpression(8, "BEAT_TIME") === "8 * BEAT_TIME");
  // Fallback for non-clean fractions
  check("0.3 → (int)(0.3 * BEAT_TIME)", durationToCppExpression(0.3, "BEAT_TIME") === "(int)(0.3 * BEAT_TIME)");
}

console.log("\n=== 11. Custom animation function definitions deduped across dances ===");
{
  // Re-use the same custom in two dances; confirm only one definition is emitted.
  const sparkle = {
    schemaVersion: "1.0",
    type: "led-animation" as const,
    id: "ca-sparkle",
    name: "Sparkle",
    description: "",
    kind: "customCppFunction" as const,
    functionName: "sparkleBodyPart",
    cppCode: "void sparkleBodyPart(const BodyPart& part, CRGB color, int duration) { /* body */ }",
    parameters: [
      { name: "part", type: "BodyPart" as const, required: true },
      { name: "color", type: "CRGB" as const, required: true },
      { name: "duration", type: "int" as const, required: true },
    ],
  };
  const danceA = {
    ...sampleDanceProject,
    id: "dance-a",
    name: "Dance A",
    customAnimations: [sparkle],
    sections: [{
      id: "sa",
      name: "Main",
      steps: [{
        id: "sa-st",
        durationBeats: 1,
        clearBefore: true,
        actions: [{
          type: "animation" as const,
          dancers: [1],
          part: "whole" as const,
          color: { r: 0, g: 0, b: 0 },
          animationId: "ca-sparkle",
        }],
      }],
    }],
  };
  const danceB = { ...danceA, id: "dance-b", name: "Dance B" };
  const program = {
    schemaVersion: 1,
    type: "led-program" as const,
    id: "p",
    name: "P",
    items: [
      { id: "i1", danceId: "dance-a", mqttCommand: "ON_A", dance: danceA },
      { id: "i2", danceId: "dance-b", mqttCommand: "ON_B", dance: danceB },
    ],
  };
  const cpp = generateProgramCpp(program, "online");
  const definitionMatches = cpp.match(/void\s+sparkleBodyPart\s*\(/g) ?? [];
  check(
    `sparkleBodyPart definition appears once across two dances`,
    definitionMatches.length === 1,
    `expected 1, got ${definitionMatches.length}`,
  );
  const callMatches = cpp.match(/sparkleBodyPart\(whole,/g) ?? [];
  check(`sparkleBodyPart is called from both dances (2 call sites)`, callMatches.length === 2);
}

console.log("\n=== 12. Per-step beat-sync — every dancer branch consumes duration once ===");
{
  const cpp = generateProgramCpp(sampleProgramArrangement, "online");

  // No top-level trailing timelineDelay at section-function indent (4 spaces).
  // Every timelineDelay must live inside a branch body (8+ space indent),
  // because the old layout's trailing call was the source of the desync bug.
  const trailing = /\n    timelineDelay(?:Safe)?\(/;
  check(
    "No trailing top-level timelineDelay() at section-function indent",
    !trailing.test(cpp),
    "the old `if(...) {...} timelineDelay(d);` pattern would double animation time",
  );

  // Animation while-loops never contain timelineDelay — the loop itself is
  // the duration consumer.
  const animationBlocks = [...cpp.matchAll(/while \(anim\.update[\s\S]*?\n        \}/g)];
  for (const m of animationBlocks) {
    check(
      `Animation while-loop has no timelineDelay`,
      !m[0].includes("timelineDelay"),
    );
  }

  // Each step with at least one action emits an `else { FastLED.show(); timelineDelay(...); }`
  // so any DANCER value not covered by an explicit branch still spends `duration`.
  const elseBranches = cpp.match(/else \{[\s\S]*?FastLED\.show\(\);[\s\S]*?timelineDelay\(/g) ?? [];
  check(
    `Every step with actions has an else branch that consumes duration (got ${elseBranches.length}, expected ≥ 4 for sample)`,
    elseBranches.length >= 4,
  );

  // Static action branches always end with FastLED.show() then timelineDelay.
  // Spot-check sample: step-chorus-2 has two static actions for different
  // dancer groups, both should follow the pattern.
  const chorus2 = cpp.slice(cpp.indexOf("Step step-chorus-2"));
  const chorus2End = chorus2.indexOf("\n}\n", chorus2.indexOf("else {"));
  const chorus2Block = chorus2.slice(0, chorus2End + 2);
  const staticBranchEnd = /fillBodyPart\([\s\S]*?FastLED\.show\(\);\s*\n\s+timelineDelay\(/;
  check(
    "Static action branches end with FastLED.show() + timelineDelay",
    staticBranchEnd.test(chorus2Block),
  );
}

console.log("\n=== 13. Defensive throw on dancer-in-multiple-actions ===");
{
  const conflicting = {
    ...sampleDanceProject,
    id: "dance-conflict",
    sections: [
      {
        id: "s-c",
        name: "Conflict",
        steps: [
          {
            id: "step-c",
            durationBeats: 1,
            clearBefore: true,
            actions: [
              {
                type: "static" as const,
                dancers: [1, 2],
                parts: ["body" as const],
                color: { r: 255, g: 0, b: 0 },
              },
              {
                type: "static" as const,
                dancers: [2, 3], // dancer 2 collides with the previous action
                parts: ["hat" as const],
                color: { r: 0, g: 255, b: 0 },
              },
            ],
          },
        ],
      },
    ],
  };
  let threw = false;
  let msg = "";
  try {
    generateDanceCpp(conflicting, "online");
  } catch (e) {
    threw = true;
    msg = e instanceof Error ? e.message : String(e);
  }
  check("Codegen throws when same dancer appears in multiple actions", threw);
  check(
    "Throw message identifies the offending dancer and step",
    msg.includes("dancer 2") && msg.includes("step-c"),
    msg,
  );
}

console.log("\n=== 14. Mutually-exclusive branches: animation + static + idle in one step ===");
{
  const mixed = {
    ...sampleDanceProject,
    id: "dance-mixed",
    name: "Mixed",
    dancers: [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
      { id: 3, name: "C" },
      { id: 4, name: "D" },
    ],
    sections: [
      {
        id: "s-mixed",
        name: "Mixed",
        steps: [
          {
            id: "step-mixed",
            durationBeats: 2,
            clearBefore: true,
            actions: [
              {
                type: "animation" as const,
                dancers: [1],
                part: "arms" as const,
                color: { r: 255, g: 0, b: 0 },
                animationId: "LTR",
              },
              {
                type: "static" as const,
                dancers: [2, 3],
                parts: ["body" as const],
                color: { r: 0, g: 255, b: 0 },
              },
              // dancer 4 has no action → falls into else branch
            ],
          },
        ],
      },
    ],
  };
  const cpp = generateDanceCpp(mixed, "online");

  // Three branches in order: animation (if), static (else if), idle (else)
  const expectedOrder = /if \(DANCER == 1\) \{[\s\S]*?Animation anim = Animation::LTR\([\s\S]*?\}\s*\n\s*else if \(DANCER == 2 \|\| DANCER == 3\) \{[\s\S]*?fillBodyPart\(body[\s\S]*?timelineDelay\([\s\S]*?\}\s*\n\s*else \{[\s\S]*?FastLED\.show\(\);[\s\S]*?timelineDelay\(/;
  check("Step emits if (animation) → else if (static) → else (idle) chain", expectedOrder.test(cpp));

  const animBlock = cpp.slice(cpp.indexOf("Animation anim ="), cpp.indexOf("else if"));
  check(
    "Animation branch (dancer 1) does NOT contain timelineDelay",
    !animBlock.includes("timelineDelay"),
  );

  const staticBlock = cpp.slice(cpp.indexOf("else if"), cpp.indexOf("else {", cpp.indexOf("else if")));
  check(
    "Static branch (dancers 2,3) DOES contain timelineDelay",
    /timelineDelay\(2 \* BEAT_TIME_/.test(staticBlock),
  );

  const idleBlock = cpp.slice(cpp.lastIndexOf("else {"));
  check(
    "Idle branch DOES contain FastLED.show() + timelineDelay",
    idleBlock.includes("FastLED.show();") && /timelineDelay\(2 \* BEAT_TIME_/.test(idleBlock),
  );
}

console.log(`\n${passes}/${passes + failures} passed${failures > 0 ? ` (${failures} failed)` : ""}`);
process.exit(failures > 0 ? 1 : 0);
