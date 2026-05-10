import type {
  CustomAnimation,
  DanceAction,
  ExportMode,
} from "@/types";
import { colorToCpp, dancerConditionToCpp } from "./expressions";

const BUILT_IN_PART_ANIMATIONS = new Set(["ShowColor", "LTR", "RTL", "Center"]);
const NESTED_ANIMATIONS = new Set(["Multi", "Sequential"]);

export function timelineDelayName(exportMode: ExportMode): string {
  return exportMode === "offline" ? "timelineDelaySafe" : "timelineDelay";
}

// Lines that go INSIDE the if-branch body of a static action. Ends with
// FastLED.show() + timelineDelay(duration), so the dancer's wall-clock time
// on this branch is exactly `durationExpression`.
export function staticActionBranchBody(
  action: DanceAction,
  durationExpression: string,
  exportMode: ExportMode,
): string[] {
  const partList = action.parts ?? (action.part ? [action.part] : []);
  const colorExpr = colorToCpp(action.color);
  const lines: string[] = [];
  for (const part of partList) {
    lines.push(`fillBodyPart(${part}, ${colorExpr});`);
  }
  lines.push(`FastLED.show();`);
  lines.push(`${timelineDelayName(exportMode)}(${durationExpression});`);
  return lines;
}

// Lines that go INSIDE the if-branch body of an animation action. Animation
// factories block for `durationExpression` (Animation::* update() returns
// false at el >= duration); custom calls are required by contract to take
// exactly the same duration. NEITHER appends a timelineDelay — adding one
// would make this branch take 2× duration and desync from sibling branches.
export function animationActionBranchBody(
  action: DanceAction,
  durationExpression: string,
  exportMode: ExportMode,
  customAnimations: ReadonlyArray<CustomAnimation> = [],
): string[] {
  const animationId = action.animationId;
  if (!animationId) {
    throw new Error(
      `Animation action requires animationId (dancers=${action.dancers.join(",")}).`,
    );
  }
  if (NESTED_ANIMATIONS.has(animationId)) {
    throw new Error(
      `Animation "${animationId}" requires sub-animations and cannot be a flat action.`,
    );
  }

  const colorExpr = colorToCpp(action.color);

  let factoryCall: string;
  if (animationId === "Rainbow") {
    factoryCall = `Animation::Rainbow(${durationExpression})`;
  } else if (BUILT_IN_PART_ANIMATIONS.has(animationId)) {
    if (!action.part) throw new Error(`Animation "${animationId}" requires a "part".`);
    factoryCall = `Animation::${animationId}(${action.part}, ${colorExpr}, ${durationExpression})`;
  } else {
    if (!action.part) throw new Error(`Custom animation "${animationId}" requires a "part".`);
    const found = customAnimations.find((c) => c.id === animationId);
    if (!found) {
      throw new Error(
        `Custom animation "${animationId}" referenced by an action is not present in customAnimations`,
      );
    }
    return [`${found.functionName}(${action.part}, ${colorExpr}, ${durationExpression});`];
  }

  const loopBody = exportMode === "online"
    ? ["    FastLED.show();", "    client.loop();", "    delay(1);"]
    : ["    FastLED.show();", "    delay(1);"];

  return [
    `Animation anim = ${factoryCall};`,
    `anim.begin();`,
    `while (anim.update() && danceRunning) {`,
    ...loopBody,
    `}`,
  ];
}

// Public helper: full `if (DANCER == ...) { <body> }` for a single static
// action. Body ends with FastLED.show() + timelineDelay(duration), so the
// branch consumes exactly `durationExpression` of wall-clock time.
//
// Note: the second parameter is the precomputed duration expression
// ("2 * BEAT_TIME_X"), not just the BEAT_TIME identifier. The step-level
// generator has already resolved durationBeats × beatTime when it calls
// this helper.
export function generateStaticActionCpp(
  action: DanceAction,
  durationExpression: string,
  exportMode: ExportMode = "online",
): string {
  if (action.dancers.length === 0) return "";
  const partList = action.parts ?? (action.part ? [action.part] : []);
  if (partList.length === 0) return "";
  const condition = dancerConditionToCpp(action.dancers);
  const body = staticActionBranchBody(action, durationExpression, exportMode);
  return [
    `if (${condition}) {`,
    ...body.map((l) => `    ${l}`),
    `}`,
  ].join("\n");
}

// Public helper: full `if (DANCER == ...) { <body> }` for an animation
// action. Body is just the animation loop (or custom call) — no timelineDelay
// is appended; see animationActionBranchBody() for why.
export function generateAnimationActionCpp(
  action: DanceAction,
  durationExpression: string,
  exportMode: ExportMode,
  customAnimations: ReadonlyArray<CustomAnimation> = [],
): string {
  if (action.dancers.length === 0) return "";
  const condition = dancerConditionToCpp(action.dancers);
  const body = animationActionBranchBody(action, durationExpression, exportMode, customAnimations);
  return [
    `if (${condition}) {`,
    ...body.map((l) => `    ${l}`),
    `}`,
  ].join("\n");
}
