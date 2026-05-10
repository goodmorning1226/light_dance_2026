import type {
  CustomAnimation,
  DanceProject,
  DanceSection,
  DanceStep,
  ExportMode,
} from "@/types";
import { dedupeIdentifiers, sanitizeCppIdentifier } from "./sanitize";
import { durationToCppExpression, dancerConditionToCpp } from "./expressions";
import {
  animationActionBranchBody,
  staticActionBranchBody,
  timelineDelayName,
} from "./actions";
import { timelineEventsToEmissionSteps } from "./timelineEmission";

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : line))
    .join("\n");
}

// Each step is emitted as a chain of mutually-exclusive dancer branches. Every
// branch consumes exactly `duration` of wall-clock time, so a dancer's path
// through the step is:
//
//   - static action → fillBodyPart()s + FastLED.show() + timelineDelay(d)
//   - animation     → Animation::* loop OR custom blocking call (both take d)
//   - idle (else)   → FastLED.show() + timelineDelay(d)
//
// We must never emit a trailing `timelineDelay(d)` after the if-chain: that
// would make the animation branch take 2× duration on its dancer (animation
// + delay), desyncing them from peers.
function generateStepCpp(
  step: DanceStep,
  beatTimeName: string,
  exportMode: ExportMode,
  customAnimations: ReadonlyArray<CustomAnimation>,
): string {
  const duration = durationToCppExpression(step.durationBeats, beatTimeName);
  const lines: string[] = [];
  lines.push(`// Step ${step.id} — ${step.durationBeats} beat(s)`);

  // Defensive: every dancer must appear in at most one action so the
  // mutually-exclusive if/else if chain reaches each dancer through exactly
  // one branch. Without this guarantee, putting the same dancer in two
  // animation actions would silently double their step duration.
  const seen = new Set<number>();
  for (const action of step.actions) {
    for (const id of action.dancers) {
      if (seen.has(id)) {
        throw new Error(
          `Step "${step.id}": dancer ${id} appears in more than one action. ` +
            `Each dancer must be assigned to at most one action per step ` +
            `(split into multiple steps if you need that dancer to do multiple things).`,
        );
      }
      seen.add(id);
    }
  }

  // clearBefore is a fast pixel-buffer write (no FastLED.show); doing it once
  // before the dispatch keeps every branch's body uniform.
  if (step.clearBefore) {
    lines.push(`fill_solid(leds, NUM_LEDS, CRGB::Black);`);
  }

  const idleBody = [`FastLED.show();`, `${timelineDelayName(exportMode)}(${duration});`];
  const validActions = step.actions.filter((a) => a.dancers.length > 0);

  if (validActions.length === 0) {
    // No actions: every dancer hits the idle path unconditionally.
    lines.push(...idleBody);
    return lines.join("\n");
  }

  for (let i = 0; i < validActions.length; i++) {
    const action = validActions[i]!;
    const condition = dancerConditionToCpp(action.dancers);
    const body =
      action.type === "static"
        ? staticActionBranchBody(action, duration, exportMode)
        : animationActionBranchBody(action, duration, exportMode, customAnimations);
    const keyword = i === 0 ? "if" : "else if";
    lines.push(`${keyword} (${condition}) {`);
    for (const bodyLine of body) {
      lines.push(bodyLine.length > 0 ? `    ${bodyLine}` : bodyLine);
    }
    lines.push(`}`);
  }

  // Catch-all branch covers any DANCER value not enumerated above (including
  // the .ino's `0` "test all" sentinel) so they spend the same wall-clock time
  // on this step as their peers.
  lines.push(`else {`);
  for (const bodyLine of idleBody) {
    lines.push(`    ${bodyLine}`);
  }
  lines.push(`}`);

  return lines.join("\n");
}

function generateSectionCpp(
  section: DanceSection,
  sectionFnName: string,
  beatTimeName: string,
  exportMode: ExportMode,
  customAnimations: ReadonlyArray<CustomAnimation>,
): string {
  const stepBlocks = section.steps.map((step) =>
    indent(generateStepCpp(step, beatTimeName, exportMode, customAnimations), 4),
  );
  const body = stepBlocks.length > 0 ? stepBlocks.join("\n\n") : "    // (no steps)";
  return [
    `void ${sectionFnName}() {`,
    `    Serial.println("Section: ${section.name}");`,
    body,
    `}`,
  ].join("\n");
}

// Computes the public function names this dance will emit. Section names
// that sanitize to the same identifier are disambiguated with `_1`, `_2` ...
// so the generated C++ never has duplicate definitions.
export function computeDanceFunctionNames(
  danceProject: DanceProject,
  safeNameOverride?: string,
): { safeName: string; danceFnName: string; sectionFnNames: string[] } {
  const safeName = safeNameOverride ?? sanitizeCppIdentifier(danceProject.name);
  const sanitizedSections = danceProject.sections.map((s) =>
    sanitizeCppIdentifier(s.name),
  );
  const dedupedSections = dedupeIdentifiers(sanitizedSections);
  const sectionFnNames = dedupedSections.map((s) => `play${safeName}_${s}`);
  return { safeName, danceFnName: `dance${safeName}`, sectionFnNames };
}

// `safeNameOverride` lets the program-level codegen dedupe across multiple
// dances that sanitize to the same identifier (`dance${safeName}` would
// otherwise collide). When omitted, the dance's own name is used.
export function generateDanceCpp(
  danceProject: DanceProject,
  exportMode: ExportMode,
  options: { safeName?: string } = {},
): string {
  const { safeName, danceFnName, sectionFnNames } = computeDanceFunctionNames(
    danceProject,
    options.safeName,
  );
  const bpmName = `BPM_${safeName}`;
  const beatTimeName = `BEAT_TIME_${safeName}`;

  const sectionBlocks: string[] = [];
  for (let i = 0; i < danceProject.sections.length; i++) {
    const section = danceProject.sections[i]!;
    const fnName = sectionFnNames[i]!;
    // When the dance has been migrated to timeline events, derive the per-
    // section step list from those events so codegen sees the canonical
    // timeline. Falls through to legacy `section.steps` for un-migrated data.
    const effectiveSteps = timelineEventsToEmissionSteps(danceProject, section);
    const effectiveSection: DanceSection =
      effectiveSteps === section.steps ? section : { ...section, steps: effectiveSteps };
    sectionBlocks.push(
      generateSectionCpp(effectiveSection, fnName, beatTimeName, exportMode, danceProject.customAnimations),
    );
  }

  const fwdDecls = [
    `void ${danceFnName}();`,
    ...sectionFnNames.map((n) => `void ${n}();`),
  ].join("\n");

  const danceBody: string[] = [
    `    Serial.println("${danceProject.name}: starting...");`,
    `    startTimeline();`,
    `    danceRunning = true;`,
    "",
  ];
  for (const fnName of sectionFnNames) {
    danceBody.push(`    ${fnName}();`);
    danceBody.push(`    if (!shouldContinueDance()) { stopEffect(); return; }`);
    danceBody.push("");
  }
  danceBody.push(`    stopEffect();`);

  return [
    `// === Dance: ${danceProject.name} (BPM ${danceProject.bpm}) ===`,
    `#define ${bpmName} ${danceProject.bpm}`,
    `#define ${beatTimeName} (60000 / ${bpmName})`,
    "",
    `// Forward declarations`,
    fwdDecls,
    "",
    `void ${danceFnName}() {`,
    danceBody.join("\n"),
    `}`,
    "",
    sectionBlocks.join("\n\n"),
  ].join("\n");
}
