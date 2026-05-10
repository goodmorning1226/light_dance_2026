// Verifies the EffectAction expansion contract: how the five effect types
// turn into ExpandedEffectStep arrays, and that codegen + preview agree on
// what those expansions produce.
import type {
  DanceAction,
  DanceProject,
  EffectConfig,
  TimelineEvent,
} from "@/types";
import {
  effectDefaultsFromAction,
  expandEffectAction,
  expandEventToVirtualEvents,
  orderedDancersFor,
  resolveActiveActionsAtBeat,
} from "@/lib/editor/effectModel";
import { importDanceFromJson, exportDanceToJson } from "@/lib/io";
import { generateDanceCpp } from "@/lib/codegen";
import { migrateStepsToTimelineEvents } from "@/lib/editor/migration";

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

// Convenience builders —— concise enough to keep the test cases readable.
function effectAction(
  effect: EffectConfig,
  dancers: number[],
  parts: ReadonlyArray<string> = ["body"],
): DanceAction {
  return {
    type: "effect",
    dancers,
    parts: parts as NonNullable<DanceAction["parts"]>,
    color: { r: 255, g: 230, b: 25 },
    effect,
  };
}

function buildEvent(
  id: string,
  startBeat: number,
  durationBeats: number,
  actions: DanceAction[],
): TimelineEvent {
  return {
    id,
    sectionId: "s1",
    startBeat,
    durationBeats,
    clearBefore: true,
    actions,
  };
}

// ───────────────────────── orderedDancersFor ─────────────────────────────
console.log("\n=== orderedDancersFor ===");
{
  const pool = [3, 7, 5, 1, 4, 6, 2];
  check(
    "in-order sorts ascending",
    JSON.stringify(orderedDancersFor({ effectType: "dancer-wave", orderMode: "in-order" }, pool)) ===
      JSON.stringify([1, 2, 3, 4, 5, 6, 7]),
  );
  check(
    "reverse sorts descending",
    JSON.stringify(orderedDancersFor({ effectType: "dancer-wave", orderMode: "reverse" }, pool)) ===
      JSON.stringify([7, 6, 5, 4, 3, 2, 1]),
  );
  check(
    "custom uses customOrder verbatim (filtered to pool)",
    JSON.stringify(
      orderedDancersFor(
        {
          effectType: "dancer-wave",
          orderMode: "custom",
          customOrder: [3, 7, 99, 5, 1, 4, 6, 2],
        },
        pool,
      ),
    ) === JSON.stringify([3, 7, 5, 1, 4, 6, 2]),
  );
}

// ───────────────────────── global-switch ─────────────────────────────────
console.log("\n=== global-switch expansion ===");
{
  const action = effectAction({ effectType: "global-switch", clearBeforeStep: true }, [1, 2, 3], ["body"]);
  const steps = expandEffectAction(action.effect!, 1, effectDefaultsFromAction(action));
  check("one sub-step", steps.length === 1);
  check("sub-step covers full duration", steps[0]?.durationBeats === 1);
  check("sub-step targets all dancers", steps[0]?.actions[0]?.dancers.length === 3);
  check("sub-step paints chosen part", steps[0]?.actions[0]?.parts?.[0] === "body");
}

// ───────────────────────── dancer-wave ───────────────────────────────────
console.log("\n=== dancer-wave expansion ===");
{
  const dancers = [1, 2, 3, 4, 5, 6, 7];
  const action = effectAction(
    { effectType: "dancer-wave", orderMode: "in-order", mode: "one-by-one" },
    dancers,
    ["body", "hat"],
  );
  const steps = expandEffectAction(action.effect!, 1, effectDefaultsFromAction(action));
  check("7 sub-steps for 7 dancers", steps.length === 7);
  check(
    "stepDuration = 1/7 (sums to 1)",
    Math.abs(steps.reduce((acc, s) => acc + s.durationBeats, 0) - 1) < 1e-9,
  );
  check("step 0 lights dancer 1", steps[0]?.actions[0]?.dancers[0] === 1);
  check("step 6 lights dancer 7", steps[6]?.actions[0]?.dancers[0] === 7);
  check("one-by-one only one dancer per step", steps.every((s) => s.actions[0]?.dancers.length === 1));

  const acc = effectAction(
    { effectType: "dancer-wave", orderMode: "in-order", mode: "accumulate" },
    [1, 2, 3],
    ["body"],
  );
  const accSteps = expandEffectAction(acc.effect!, 0.6, effectDefaultsFromAction(acc));
  check("accumulate step 2 lights 3 dancers", accSteps[2]?.actions[0]?.dancers.length === 3);
  check("accumulate step 0 lights 1 dancer", accSteps[0]?.actions[0]?.dancers.length === 1);

  const colored = effectAction(
    {
      effectType: "dancer-wave",
      orderMode: "in-order",
      colors: [
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 255, b: 0 },
      ],
    },
    [1, 2, 3, 4],
    ["body"],
  );
  const colorSteps = expandEffectAction(colored.effect!, 1, effectDefaultsFromAction(colored));
  check("colors[] cycles per dancer", colorSteps[0]?.actions[0]?.color.r === 255 && colorSteps[1]?.actions[0]?.color.g === 255);
  check("colors[] wraps modulo length", colorSteps[2]?.actions[0]?.color.r === 255);
}

// ───────────────────────── group-sequence ────────────────────────────────
console.log("\n=== group-sequence expansion ===");
{
  const action = effectAction(
    {
      effectType: "group-sequence",
      dancerGroups: [[7, 3], [5, 7], [1, 5], [4, 1], [6, 4], [2, 6], [2]],
    },
    [1, 2, 3, 4, 5, 6, 7],
    ["body"],
  );
  const steps = expandEffectAction(action.effect!, 1, effectDefaultsFromAction(action));
  check("7 sub-steps for 7 groups", steps.length === 7);
  check("step 0 lights group [7,3]", JSON.stringify(steps[0]?.actions[0]?.dancers) === JSON.stringify([7, 3]));
  check("step 6 lights group [2]", JSON.stringify(steps[6]?.actions[0]?.dancers) === JSON.stringify([2]));
}

// ───────────────────────── fast-part-chase ───────────────────────────────
console.log("\n=== fast-part-chase expansion ===");
{
  const action = effectAction(
    {
      effectType: "fast-part-chase",
      orderMode: "custom",
      customOrder: [3, 7, 5, 1, 4, 6, 2],
    },
    [1, 2, 3, 4, 5, 6, 7],
    ["hat"],
  );
  const steps = expandEffectAction(action.effect!, 0.75, effectDefaultsFromAction(action));
  check("7 sub-steps for 7 dancers", steps.length === 7);
  check(
    "stepDuration ≈ 0.75 / 7",
    Math.abs(steps[0]!.durationBeats - 0.75 / 7) < 1e-9,
  );
  check("step 0 lights dancer 3 (custom order)", steps[0]?.actions[0]?.dancers[0] === 3);
  check("step 1 lights dancer 7", steps[1]?.actions[0]?.dancers[0] === 7);
  check("part is hat", steps[0]?.actions[0]?.parts?.[0] === "hat");
}

// ───────────────────────── strobe ────────────────────────────────────────
console.log("\n=== strobe expansion ===");
{
  const action = effectAction(
    { effectType: "strobe", blinkCount: 4, onRatio: 0.5, offRatio: 0.5 },
    [1, 2],
    ["body"],
  );
  const steps = expandEffectAction(action.effect!, 1, effectDefaultsFromAction(action));
  check("8 sub-steps (4 on/off pairs)", steps.length === 8);
  check("durations sum to 1", Math.abs(steps.reduce((acc, s) => acc + s.durationBeats, 0) - 1) < 1e-9);
  // Even-indexed sub-steps are ON (use action.color); odd are OFF (black).
  check("first sub-step is ON (yellow)", steps[0]?.actions[0]?.color.r === 255 && steps[0]?.actions[0]?.color.g === 230);
  check("second sub-step is OFF (black)", steps[1]?.actions[0]?.color.r === 0 && steps[1]?.actions[0]?.color.b === 0);

  // Asymmetric ratio
  const action2 = effectAction(
    { effectType: "strobe", blinkCount: 2, onRatio: 0.2, offRatio: 0.8 },
    [1],
    ["body"],
  );
  const s2 = expandEffectAction(action2.effect!, 1, effectDefaultsFromAction(action2));
  // each cycle = 0.5; on = 0.5 * 0.2 / (0.2 + 0.8) = 0.1; off = 0.4
  check("on duration 0.1", Math.abs(s2[0]!.durationBeats - 0.1) < 1e-9);
  check("off duration 0.4", Math.abs(s2[1]!.durationBeats - 0.4) < 1e-9);
}

// ───────────────────── resolveActiveActionsAtBeat ────────────────────────
console.log("\n=== resolveActiveActionsAtBeat picks the right sub-step ===");
{
  const action = effectAction(
    { effectType: "dancer-wave", orderMode: "in-order", mode: "one-by-one" },
    [1, 2, 3, 4, 5, 6, 7],
    ["body"],
  );
  const event = buildEvent("e1", 8, 1, [action]);
  // event spans beats 8..9, 7 sub-steps each 1/7 long.
  // beat 8.0 → sub-step 0 → dancer 1
  // beat 8.5 → sub-step floor(0.5/(1/7)) = sub-step 3 → dancer 4
  // beat 8.99 → sub-step 6 → dancer 7
  const at0 = resolveActiveActionsAtBeat(event, 0);
  const at5 = resolveActiveActionsAtBeat(event, 0.5);
  const at99 = resolveActiveActionsAtBeat(event, 0.99);
  check("at offset 0 → dancer 1", at0[0]?.dancers[0] === 1);
  check("at offset 0.5 → dancer 4", at5[0]?.dancers[0] === 4);
  check("at offset 0.99 → dancer 7", at99[0]?.dancers[0] === 7);
}

// ───────────────── expandEventToVirtualEvents (codegen) ──────────────────
console.log("\n=== expandEventToVirtualEvents fans an event into virtual events ===");
{
  const action = effectAction(
    { effectType: "dancer-wave", orderMode: "in-order", mode: "one-by-one" },
    [1, 2, 3, 4],
    ["body"],
  );
  const event = buildEvent("ev1", 0, 1, [action]);
  const virt = expandEventToVirtualEvents(event);
  check("4 virtual events for 4 dancers", virt.length === 4);
  check("virtual events back-to-back",
    virt.every((v, i) => i === 0 || Math.abs(v.startBeat - (virt[i - 1]!.startBeat + virt[i - 1]!.durationBeats)) < 1e-9));
  check("virtual events cover full event range",
    Math.abs(virt.reduce((acc, v) => acc + v.durationBeats, 0) - 1) < 1e-9);
  check("virtual events have only static actions",
    virt.every((v) => v.actions.every((a) => a.type === "static")));
}

// ───────────────────────── codegen integration ───────────────────────────
console.log("\n=== Codegen: effect expands into multiple emission steps ===");
{
  const dance: DanceProject = migrateStepsToTimelineEvents({
    schemaVersion: 1,
    type: "led-dance",
    id: "d-fx",
    name: "FxTest",
    bpm: 120,
    beatUnit: 0.25,
    dancers: [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
      { id: 3, name: "C" },
    ],
    sections: [
      {
        id: "s1",
        name: "Intro",
        steps: [],
        startBeat: 0,
      },
    ],
    customAnimations: [],
    timelineEvents: [
      buildEvent("ev1", 0, 1.5, [
        effectAction(
          { effectType: "dancer-wave", orderMode: "in-order", mode: "one-by-one" },
          [1, 2, 3],
          ["body"],
        ),
      ]),
    ],
  });
  const cpp = generateDanceCpp(dance, "online");
  // Expect 3 emission steps, one per dancer, each calling fillBodyPart(body, ...).
  const fillCount = (cpp.match(/fillBodyPart\(body,/g) ?? []).length;
  check("emits 3 fillBodyPart(body, ...) calls (one per wave step)", fillCount === 3);
  check("each step has its own dancer guard", /DANCER == 1/.test(cpp) && /DANCER == 2/.test(cpp) && /DANCER == 3/.test(cpp));
}

// ───────────────────────── parser round-trip ─────────────────────────────
console.log("\n=== Parser: round-trip effect actions ===");
{
  const fxEvent = buildEvent("ev1", 0, 1, [
    effectAction(
      {
        effectType: "group-sequence",
        dancerGroups: [[1], [2], [1, 2]],
        colors: [
          { r: 1, g: 2, b: 3 },
          { r: 4, g: 5, b: 6 },
        ],
        clearBeforeStep: true,
      },
      [1, 2],
      ["body"],
    ),
  ]);
  // buildEvent helper hard-codes sectionId="s1"; override to match the
  // dance's section id below.
  fxEvent.sectionId = "s";
  const dance: DanceProject = {
    schemaVersion: 1,
    type: "led-dance",
    id: "d-rt",
    name: "RT",
    bpm: 120,
    beatUnit: 0.5,
    dancers: [{ id: 1, name: "A" }, { id: 2, name: "B" }],
    sections: [{ id: "s", name: "S", steps: [] }],
    customAnimations: [],
    timelineEvents: [fxEvent],
  };
  const json = exportDanceToJson(dance);
  const restored = importDanceFromJson(json);
  const fx = restored.timelineEvents?.[0]?.actions[0];
  check("round-trip preserves effectType", fx?.effect?.effectType === "group-sequence");
  check("round-trip preserves dancerGroups", JSON.stringify(fx?.effect?.dancerGroups) === JSON.stringify([[1], [2], [1, 2]]));
  check("round-trip preserves colors", fx?.effect?.colors?.length === 2 && fx?.effect?.colors?.[0]?.r === 1);
}

// ────────── Parser: rejects malformed effect ──────────
console.log("\n=== Parser: rejects malformed effect ===");
{
  const tryImport = (json: string, expectMatch: RegExp): void => {
    try {
      importDanceFromJson(json);
      check(`reject: ${expectMatch.source}`, false, "no error thrown");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      check(`reject: ${expectMatch.source}`, expectMatch.test(msg), msg);
    }
  };

  // type=effect without effect config
  const base = {
    schemaVersion: 1,
    type: "led-dance",
    id: "d", name: "D", bpm: 120, beatUnit: 0.5,
    dancers: [{ id: 1, name: "A" }],
    sections: [{ id: "s", name: "S", steps: [] }],
    customAnimations: [],
  };

  tryImport(
    JSON.stringify({
      ...base,
      timelineEvents: [{
        id: "ev", sectionId: "s", startBeat: 0, durationBeats: 1, clearBefore: true,
        actions: [{ type: "effect", dancers: [1], color: { r: 0, g: 0, b: 0 } }],
      }],
    }),
    /requires an "effect" config/,
  );

  // unknown effectType
  tryImport(
    JSON.stringify({
      ...base,
      timelineEvents: [{
        id: "ev", sectionId: "s", startBeat: 0, durationBeats: 1, clearBefore: true,
        actions: [{ type: "effect", dancers: [1], color: { r: 0, g: 0, b: 0 }, effect: { effectType: "bogus" } }],
      }],
    }),
    /Unknown effectType/,
  );

  // group-sequence without dancerGroups
  tryImport(
    JSON.stringify({
      ...base,
      timelineEvents: [{
        id: "ev", sectionId: "s", startBeat: 0, durationBeats: 1, clearBefore: true,
        actions: [{ type: "effect", dancers: [1], color: { r: 0, g: 0, b: 0 }, effect: { effectType: "group-sequence" } }],
      }],
    }),
    /requires non-empty dancerGroups/,
  );

  // orderMode="custom" without customOrder
  tryImport(
    JSON.stringify({
      ...base,
      timelineEvents: [{
        id: "ev", sectionId: "s", startBeat: 0, durationBeats: 1, clearBefore: true,
        actions: [{
          type: "effect", dancers: [1], color: { r: 0, g: 0, b: 0 },
          effect: { effectType: "dancer-wave", orderMode: "custom" },
        }],
      }],
    }),
    /requires non-empty customOrder/,
  );

  // effect on non-effect action
  tryImport(
    JSON.stringify({
      ...base,
      timelineEvents: [{
        id: "ev", sectionId: "s", startBeat: 0, durationBeats: 1, clearBefore: true,
        actions: [{
          type: "static", dancers: [1], color: { r: 0, g: 0, b: 0 }, parts: ["body"],
          effect: { effectType: "global-switch" },
        }],
      }],
    }),
    /effect config is only valid on type="effect"/,
  );
}

console.log(`\n${passes}/${passes + failures} passed${failures > 0 ? ` (${failures} failed)` : ""}`);
process.exit(failures > 0 ? 1 : 0);
