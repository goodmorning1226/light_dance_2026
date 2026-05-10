import { sampleDanceProject, sampleProgramArrangement } from "@/data";
import {
  exportDanceToJson,
  exportProgramToJson,
  importCustomAnimationFromJson,
  importDanceFromJson,
  importProgramFromJson,
} from "@/lib/io";

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

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).sort();
  const bk = Object.keys(bo).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
  }
  for (const k of ak) {
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

function expectError(label: string, fn: () => unknown, expectedSubstring: string): void {
  try {
    fn();
    check(label, false, "expected ImportError but no error was thrown");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const ok = msg.includes(expectedSubstring);
    check(`${label}  →  ${msg}`, ok, ok ? undefined : `expected message to contain "${expectedSubstring}"`);
  }
}

console.log("\n=== Round-trip ===");

const danceJson = exportDanceToJson(sampleDanceProject);
check("Dance JSON is pretty-printed (contains '\\n  ')", danceJson.includes("\n  "));
check("Dance JSON declares schemaVersion", danceJson.includes("\"schemaVersion\""));
check("Dance JSON declares type led-dance", danceJson.includes("\"type\": \"led-dance\""));

const danceRoundTrip = importDanceFromJson(danceJson);
check("Dance survives export → import unchanged", deepEqual(sampleDanceProject, danceRoundTrip));

const programJson = exportProgramToJson(sampleProgramArrangement);
check("Program JSON declares type led-program", programJson.includes("\"type\": \"led-program\""));
check("Program JSON embeds the dance", programJson.includes("\"led-dance\""));

const programRoundTrip = importProgramFromJson(programJson);
check("Program survives export → import unchanged", deepEqual(sampleProgramArrangement, programRoundTrip));

console.log("\n=== Negative cases — Dance ===");

expectError(
  "Reject malformed JSON",
  () => importDanceFromJson("{ not valid"),
  "Invalid dance file: malformed JSON",
);

expectError(
  "Reject wrong type (led-program in a dance import)",
  () => importDanceFromJson(JSON.stringify({ ...sampleDanceProject, type: "led-program" })),
  "Invalid dance file: Expected type \"led-dance\"",
);

expectError(
  "Reject missing bpm",
  () => {
    const broken = JSON.parse(JSON.stringify(sampleDanceProject));
    delete broken.bpm;
    return importDanceFromJson(JSON.stringify(broken));
  },
  "Invalid dance file: Missing required field \"bpm\"",
);

expectError(
  "Reject unknown body part",
  () => {
    const broken = JSON.parse(JSON.stringify(sampleDanceProject));
    broken.sections[0].steps[0].actions[0].parts = ["nose"];
    return importDanceFromJson(JSON.stringify(broken));
  },
  "Unknown body part \"nose\"",
);

expectError(
  "Reject unknown animationId",
  () => {
    const broken = JSON.parse(JSON.stringify(sampleDanceProject));
    broken.sections[0].steps[1].actions[0].animationId = "Glitter";
    return importDanceFromJson(JSON.stringify(broken));
  },
  "Unknown animationId \"Glitter\"",
);

expectError(
  "Reject color out of range",
  () => {
    const broken = JSON.parse(JSON.stringify(sampleDanceProject));
    broken.sections[0].steps[0].actions[0].color = { r: 999, g: 0, b: 0 };
    return importDanceFromJson(JSON.stringify(broken));
  },
  "Color channel out of range 0..255",
);

expectError(
  "Reject negative bpm",
  () => importDanceFromJson(JSON.stringify({ ...sampleDanceProject, bpm: -1 })),
  "bpm must be > 0",
);

console.log("\n=== Multi / Sequential ===");

const buildDanceWithMultiAction = (multiAction: unknown): unknown => {
  const broken = JSON.parse(JSON.stringify(sampleDanceProject));
  broken.sections[0].steps[1].actions[0] = multiAction;
  return broken;
};

const validMulti = {
  type: "animation",
  dancers: [1, 2, 3],
  color: { r: 0, g: 0, b: 0 },
  animationId: "Multi",
  subAnimations: [
    {
      type: "animation",
      dancers: [1, 2, 3],
      part: "leftArm",
      color: { r: 255, g: 0, b: 0 },
      animationId: "LTR",
    },
    {
      type: "animation",
      dancers: [1, 2, 3],
      part: "rightArm",
      color: { r: 0, g: 0, b: 255 },
      animationId: "RTL",
    },
  ],
};

const accepted = importDanceFromJson(
  JSON.stringify(buildDanceWithMultiAction(validMulti)),
);
const importedAction = accepted.sections[0]?.steps[1]?.actions[0];
check(
  "Accept Multi with non-empty subAnimations",
  importedAction?.animationId === "Multi" && importedAction?.subAnimations?.length === 2,
);

expectError(
  "Reject Multi without subAnimations",
  () => importDanceFromJson(JSON.stringify(buildDanceWithMultiAction({
    type: "animation",
    dancers: [1],
    color: { r: 0, g: 0, b: 0 },
    animationId: "Multi",
  }))),
  "Multi / Sequential animation requires non-empty subAnimations.",
);

expectError(
  "Reject Sequential with empty subAnimations",
  () => importDanceFromJson(JSON.stringify(buildDanceWithMultiAction({
    type: "animation",
    dancers: [1],
    color: { r: 0, g: 0, b: 0 },
    animationId: "Sequential",
    subAnimations: [],
  }))),
  "Multi / Sequential animation requires non-empty subAnimations.",
);

expectError(
  "Reject Multi with a static subAnimation",
  () => importDanceFromJson(JSON.stringify(buildDanceWithMultiAction({
    type: "animation",
    dancers: [1],
    color: { r: 0, g: 0, b: 0 },
    animationId: "Multi",
    subAnimations: [
      { type: "static", dancers: [1], parts: ["body"], color: { r: 0, g: 0, b: 0 } },
    ],
  }))),
  "subAnimations entry must have type \"animation\"",
);

expectError(
  "Reject static action carrying subAnimations",
  () => importDanceFromJson(JSON.stringify(buildDanceWithMultiAction({
    type: "static",
    dancers: [1],
    parts: ["body"],
    color: { r: 255, g: 0, b: 0 },
    subAnimations: [],
  }))),
  "static action cannot have subAnimations",
);

expectError(
  "Reject Multi nested inside Multi when inner has no subAnimations",
  () => importDanceFromJson(JSON.stringify(buildDanceWithMultiAction({
    type: "animation",
    dancers: [1],
    color: { r: 0, g: 0, b: 0 },
    animationId: "Multi",
    subAnimations: [
      { type: "animation", dancers: [1], color: { r: 0, g: 0, b: 0 }, animationId: "Multi" },
    ],
  }))),
  "Multi / Sequential animation requires non-empty subAnimations.",
);

console.log("\n=== Negative cases — Program ===");

expectError(
  "Reject wrong type (led-dance in a program import)",
  () => importProgramFromJson(JSON.stringify({ ...sampleProgramArrangement, type: "led-dance" })),
  "Invalid program file: Expected type \"led-program\"",
);

expectError(
  "Reject embedded dance.id mismatch",
  () => {
    const broken = JSON.parse(JSON.stringify(sampleProgramArrangement));
    broken.items[0].dance.id = "different-id";
    return importProgramFromJson(JSON.stringify(broken));
  },
  "does not match danceId",
);

console.log("\n=== Custom Animation ===");

const sampleCustom = {
  schemaVersion: "1.0",
  type: "led-animation" as const,
  id: "custom-sparkle-001",
  name: "Sparkle",
  description: "Random twinkles across the part",
  kind: "customCppFunction" as const,
  functionName: "customSparkle",
  cppCode: "void customSparkle(const BodyPart& part, CRGB color, int duration) {\n  // ... user-supplied body ...\n}",
  parameters: [
    { name: "part", type: "BodyPart" as const, required: true },
    { name: "color", type: "CRGB" as const, required: true },
    { name: "duration", type: "int" as const, required: true, description: "in milliseconds" },
  ],
};
const customJson = JSON.stringify(sampleCustom, null, 2);
const customRoundTrip = importCustomAnimationFromJson(customJson);
check("Custom animation round-trip", deepEqual(sampleCustom, customRoundTrip));

expectError(
  "Reject custom animation with wrong type",
  () => importCustomAnimationFromJson(JSON.stringify({ ...sampleCustom, type: "led-dance" })),
  "Invalid custom animation format: Expected type \"led-animation\"",
);

expectError(
  "Reject custom animation missing functionName",
  () => {
    const broken = { ...sampleCustom } as Record<string, unknown>;
    delete broken.functionName;
    return importCustomAnimationFromJson(JSON.stringify(broken));
  },
  "Missing required field \"functionName\"",
);

expectError(
  "Reject custom animation with empty cppCode",
  () => importCustomAnimationFromJson(JSON.stringify({ ...sampleCustom, cppCode: "" })),
  "cppCode cannot be empty",
);

expectError(
  "Reject custom animation with bad parameter type",
  () => {
    const broken = JSON.parse(JSON.stringify(sampleCustom));
    broken.parameters[0].type = "voltage";
    return importCustomAnimationFromJson(JSON.stringify(broken));
  },
  "Unknown parameter type \"voltage\"",
);

expectError(
  "Reject custom animation with parameter missing required",
  () => {
    const broken = JSON.parse(JSON.stringify(sampleCustom));
    delete broken.parameters[0].required;
    return importCustomAnimationFromJson(JSON.stringify(broken));
  },
  "Missing required field \"required\"",
);

expectError(
  "Reject custom animation with non-string schemaVersion",
  () => importCustomAnimationFromJson(JSON.stringify({ ...sampleCustom, schemaVersion: 1 })),
  "Expected string, got number",
);

expectError(
  "Reject custom animation with non-identifier functionName",
  () => importCustomAnimationFromJson(JSON.stringify({ ...sampleCustom, functionName: "1bad name" })),
  "is not a valid C++ identifier",
);

console.log(`\n${passes}/${passes + failures} passed${failures > 0 ? ` (${failures} failed)` : ""}`);
process.exit(failures > 0 ? 1 : 0);
