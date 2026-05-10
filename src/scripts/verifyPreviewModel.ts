import type { DanceStep, Dancer } from "@/types";
import { computeStepDisplay, PREVIEW_SLOTS } from "@/lib/editor/previewModel";

const dancers: Dancer[] = [
  { id: 1, name: "A" },
  { id: 2, name: "B" },
];

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

console.log("\n=== Static action paints right slots ===");
{
  // body composite paints all 5 torso slots; hat composite paints all 3 hat zones.
  const step: DanceStep = {
    id: "s1",
    durationBeats: 1,
    clearBefore: true,
    actions: [
      { type: "static", dancers: [1], parts: ["body", "hat"], color: { r: 255, g: 0, b: 0 } },
    ],
  };
  const d = computeStepDisplay(step, dancers);
  check("dancer 1 shirt painted", d[0]?.slots.shirt?.r === 255);
  check("dancer 1 collar painted", d[0]?.slots.collar?.r === 255);
  check("dancer 1 lowerShirt painted", d[0]?.slots.lowerShirt?.r === 255);
  check("dancer 1 hatMark painted", d[0]?.slots.hatMark?.r === 255);
  check("dancer 1 leftUpperArm not painted", d[0]?.slots.leftUpperArm === undefined);
  check("dancer 2 untouched", Object.keys(d[1]?.slots ?? {}).length === 0);
}

console.log("\n=== Composite parts ===");
{
  const armsStep: DanceStep = {
    id: "s-arms",
    durationBeats: 1,
    clearBefore: true,
    actions: [{ type: "static", dancers: [1], parts: ["arms"], color: { r: 0, g: 255, b: 0 } }],
  };
  const d = computeStepDisplay(armsStep, dancers);
  check("arms paints leftUpperArm", d[0]?.slots.leftUpperArm?.g === 255);
  check("arms paints rightLowerArm", d[0]?.slots.rightLowerArm?.g === 255);
  check("arms does not paint hands", d[0]?.slots.leftHand === undefined);

  const handsStep: DanceStep = {
    id: "s-hands",
    durationBeats: 1,
    clearBefore: true,
    actions: [{ type: "static", dancers: [1], parts: ["hands"], color: { r: 50, g: 50, b: 200 } }],
  };
  const dh = computeStepDisplay(handsStep, dancers);
  check("hands paints both hands", dh[0]?.slots.leftHand?.b === 200 && dh[0]?.slots.rightHand?.b === 200);

  const wholeStep: DanceStep = {
    id: "s-whole",
    durationBeats: 1,
    clearBefore: true,
    actions: [{ type: "static", dancers: [1], parts: ["whole"], color: { r: 100, g: 100, b: 100 } }],
  };
  const dw = computeStepDisplay(wholeStep, dancers);
  check(`whole paints all ${PREVIEW_SLOTS.length} slots`, Object.keys(dw[0]?.slots ?? {}).length === PREVIEW_SLOTS.length);
}

console.log("\n=== Detailed parts target their own atomic slot ===");
{
  const step: DanceStep = {
    id: "s-detail",
    durationBeats: 1,
    clearBefore: true,
    actions: [
      { type: "static", dancers: [1], parts: ["leftUpperArm"], color: { r: 1, g: 1, b: 1 } },
      { type: "static", dancers: [1], parts: ["rightLowerArm"], color: { r: 2, g: 2, b: 2 } },
      { type: "static", dancers: [1], parts: ["lowerShirt"], color: { r: 3, g: 3, b: 3 } },
      { type: "static", dancers: [1], parts: ["leftCrotch"], color: { r: 4, g: 4, b: 4 } },
      { type: "static", dancers: [1], parts: ["leftFoot"], color: { r: 5, g: 5, b: 5 } },
    ],
  };
  const d = computeStepDisplay(step, dancers);
  check("leftUpperArm targets its own slot", d[0]?.slots.leftUpperArm?.r === 1);
  check("rightLowerArm targets its own slot", d[0]?.slots.rightLowerArm?.r === 2);
  check("lowerShirt targets its own slot", d[0]?.slots.lowerShirt?.r === 3);
  check("leftCrotch targets its own slot", d[0]?.slots.leftCrotch?.r === 4);
  check("leftFoot targets its own slot", d[0]?.slots.leftFoot?.r === 5);
  check("leftUpperArm did NOT bleed into leftLowerArm", d[0]?.slots.leftLowerArm === undefined);
}

console.log("\n=== Animation paints + adds label ===");
{
  // leftArm composite paints leftUpperArm + leftLowerArm
  const step: DanceStep = {
    id: "s-anim",
    durationBeats: 1,
    clearBefore: true,
    actions: [
      {
        type: "animation",
        dancers: [1],
        part: "leftArm",
        color: { r: 200, g: 0, b: 200 },
        animationId: "LTR",
      },
    ],
  };
  const d = computeStepDisplay(step, dancers);
  check("LTR paints leftUpperArm", d[0]?.slots.leftUpperArm?.r === 200);
  check("LTR paints leftLowerArm", d[0]?.slots.leftLowerArm?.r === 200);
  check("LTR does NOT paint leftHand (leftArm composite excludes hand)", d[0]?.slots.leftHand === undefined);
  check("LTR label added", d[0]?.labels.includes("LTR") === true);
  check("No label for dancer not in action", d[1]?.labels.length === 0);
}

console.log("\n=== Rainbow paints all slots regardless of part ===");
{
  const step: DanceStep = {
    id: "s-rainbow",
    durationBeats: 1,
    clearBefore: true,
    actions: [
      {
        type: "animation",
        dancers: [1],
        part: "leftArm",
        color: { r: 50, g: 50, b: 50 },
        animationId: "Rainbow",
      },
    ],
  };
  const d = computeStepDisplay(step, dancers);
  check(`Rainbow paints all ${PREVIEW_SLOTS.length} slots`, Object.keys(d[0]?.slots ?? {}).length === PREVIEW_SLOTS.length);
  check("Rainbow label added", d[0]?.labels.includes("Rainbow") === true);
}

console.log("\n=== Multiple actions: later overrides earlier on the same slot ===");
{
  const step: DanceStep = {
    id: "s-stack",
    durationBeats: 1,
    clearBefore: true,
    actions: [
      { type: "static", dancers: [1], parts: ["shirt"], color: { r: 255, g: 0, b: 0 } },
      { type: "static", dancers: [1], parts: ["shirt"], color: { r: 0, g: 255, b: 0 } },
    ],
  };
  const d = computeStepDisplay(step, dancers);
  check("Latest paint wins", d[0]?.slots.shirt?.r === 0 && d[0]?.slots.shirt?.g === 255);
}

console.log("\n=== Null / empty step ===");
{
  const d = computeStepDisplay(null, dancers);
  check("Null step → empty slots", d.every((x) => Object.keys(x.slots).length === 0));
  check("Null step → empty labels", d.every((x) => x.labels.length === 0));
}

console.log(`\n${passes}/${passes + failures} passed${failures > 0 ? ` (${failures} failed)` : ""}`);
process.exit(failures > 0 ? 1 : 0);
