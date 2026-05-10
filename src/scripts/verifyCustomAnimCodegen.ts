import type {
  CustomAnimation,
  DanceProject,
  ProgramArrangement,
} from "@/types";
import { generateProgramCpp } from "@/lib/codegen";

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

const sparkle: CustomAnimation = {
  schemaVersion: "1.0",
  type: "led-animation",
  id: "custom-sparkle",
  name: "Sparkle",
  description: "Random twinkles",
  kind: "customCppFunction",
  functionName: "sparkleBodyPart",
  cppCode:
    "void sparkleBodyPart(const BodyPart& part, CRGB color, int duration) {\n  // sparkle body\n}",
  parameters: [
    { name: "part", type: "BodyPart", required: true },
    { name: "color", type: "CRGB", required: true },
    { name: "duration", type: "int", required: true },
  ],
};

const sparkleWithMqtt: CustomAnimation = {
  ...sparkle,
  id: "custom-sparkle-mqtt",
  functionName: "sparkleMqtt",
  cppCode:
    "void sparkleMqtt(const BodyPart& part, CRGB color, int duration) {\n  client.loop();\n}",
};

function makeDance(id: string, name: string, customs: CustomAnimation[]): DanceProject {
  return {
    schemaVersion: 1,
    type: "led-dance",
    id,
    name,
    bpm: 120,
    beatUnit: 0.5,
    dancers: [{ id: 1, name: "D1" }],
    customAnimations: customs,
    sections: [
      {
        id: `${id}-section`,
        name: "Main",
        steps: [
          {
            id: `${id}-step1`,
            durationBeats: 1,
            clearBefore: true,
            actions: [
              {
                type: "animation",
                dancers: [1],
                part: "whole",
                color: { r: 255, g: 0, b: 0 },
                animationId: customs[0]?.id ?? "ShowColor",
              },
            ],
          },
        ],
      },
    ],
  };
}

console.log("\n=== Custom animation in codegen ===");

{
  const danceA = makeDance("dance-a", "Dance A", [sparkle]);
  const program: ProgramArrangement = {
    schemaVersion: 1,
    type: "led-program",
    id: "p1",
    name: "P1",
    items: [{ id: "item-a", danceId: danceA.id, mqttCommand: "ON_A", dance: danceA }],
  };

  const cpp = generateProgramCpp(program, "online");
  check("Custom function definition appears in output", cpp.includes("void sparkleBodyPart("));
  check(
    "Action emits a direct call using the functionName (not the id)",
    cpp.includes("sparkleBodyPart(whole,") && !cpp.includes("custom-sparkle("),
  );
}

console.log("\n=== Dedup: two dances using the same custom emit it once ===");

{
  const danceA = makeDance("dance-a", "Dance A", [sparkle]);
  const danceB = makeDance("dance-b", "Dance B", [sparkle]);
  const program: ProgramArrangement = {
    schemaVersion: 1,
    type: "led-program",
    id: "p2",
    name: "P2",
    items: [
      { id: "item-a", danceId: danceA.id, mqttCommand: "ON_A", dance: danceA },
      { id: "item-b", danceId: danceB.id, mqttCommand: "ON_B", dance: danceB },
    ],
  };

  const cpp = generateProgramCpp(program, "online");
  const matches = cpp.match(/void sparkleBodyPart\(/g) ?? [];
  check(
    "sparkleBodyPart definition appears exactly once across two dances",
    matches.length === 1,
    `expected 1 occurrence, got ${matches.length}`,
  );
  check("Both dance functions still get generated", cpp.includes("void danceDanceA(") && cpp.includes("void danceDanceB("));
}

console.log("\n=== Throw on duplicate functionName across different ids ===");

{
  const aliasSparkle: CustomAnimation = { ...sparkle, id: "custom-sparkle-2" };
  const danceA = makeDance("dance-a", "Dance A", [sparkle]);
  const danceB = makeDance("dance-b", "Dance B", [aliasSparkle]);
  const program: ProgramArrangement = {
    schemaVersion: 1,
    type: "led-program",
    id: "p3",
    name: "P3",
    items: [
      { id: "item-a", danceId: danceA.id, mqttCommand: "ON_A", dance: danceA },
      { id: "item-b", danceId: danceB.id, mqttCommand: "ON_B", dance: danceB },
    ],
  };

  let threw = false;
  try {
    generateProgramCpp(program, "online");
  } catch (e) {
    threw = (e as Error).message.includes("Function names must be unique");
  }
  check("Two different ids with the same functionName are rejected", threw);
}

console.log("\n=== Offline export warns about MQTT references in cppCode ===");

{
  const danceA = makeDance("dance-a", "Dance A", [sparkleWithMqtt]);
  const program: ProgramArrangement = {
    schemaVersion: 1,
    type: "led-program",
    id: "p4",
    name: "P4",
    items: [{ id: "item-a", danceId: danceA.id, mqttCommand: "ON_A", dance: danceA }],
  };

  const offline = generateProgramCpp(program, "offline");
  check("Offline export contains a WARNING comment near the MQTT-using custom", offline.includes("⚠️ WARNING"));
  check("Offline export does NOT call client.loop() in the dance body", !/[^a-zA-Z]client\.loop\(\)/.test(offline.replace(/sparkleMqtt[\s\S]*?\}/, "")));

  const online = generateProgramCpp(program, "online");
  check("Online export does NOT add the WARNING (MQTT is wired up)", !online.includes("⚠️ WARNING"));
}

console.log(`\n${passes}/${passes + failures} passed${failures > 0 ? ` (${failures} failed)` : ""}`);
process.exit(failures > 0 ? 1 : 0);
