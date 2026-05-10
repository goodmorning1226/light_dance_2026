import type { BodyPartName } from "./bodyPart";
import type { BuiltInAnimationId } from "./animation";
import type { ColorRGB } from "./color";
import type { CustomAnimation } from "./customAnimation";
import type { TimelineEvent } from "./timeline";

// `id` matches the int that the .ino code compares against — DANCER, PERSON,
// and ROLE are all numeric. Range is 1..7 in the existing songs but the type
// stays open for future expansion.
export interface Dancer {
  id: number;
  name: string;
}

// One LED instruction within a step.
//   - "static"    → a held color (Style B: fillBodyPart / fillColorSet idiom)
//   - "animation" → a time-varying effect built from Animation::* factories
//   - "effect"    → a high-level composite that the editor / codegen expands
//                   into multiple internal sub-steps automatically. The user
//                   sees ONE event on the timeline; preview + codegen share
//                   the SAME expansion routine (see `expandEffectAction` in
//                   `src/lib/editor/effectModel.ts`) so their behaviour
//                   never drifts.
//
// `dancers` is the list of Dancer.id values that should respond to this
// action; the code generator emits `if (DANCER == X || DANCER == Y) { ... }`.
//
// `parts` is used by static actions (multiple body parts share the same
// color); `part` is used by animation actions that take a single BodyPart&.
//
// `animationId` is required when type === "animation". A built-in id maps to
// `Animation::<id>(...)`; any other string is treated as a CustomAnimation.id.
//
// `subAnimations` is required when animationId is "Multi" or "Sequential" and
// must be non-empty; each entry must itself be a type === "animation" action.
// Invalid for static actions.
//
// `effect` is required when type === "effect". The standard `dancers`,
// `parts`, and `color` fields supply the defaults the effect can use; per-
// effect extras (groups, custom order, blink counts, …) live inside the
// EffectConfig.
export interface DanceAction {
  type: "static" | "animation" | "effect";
  dancers: number[];
  parts?: BodyPartName[];
  part?: BodyPartName;
  color: ColorRGB;
  animationId?: BuiltInAnimationId | string;
  subAnimations?: DanceAction[];
  effect?: EffectConfig;
}

// One of the five built-in high-level effect templates the editor can
// schedule. See `src/lib/editor/effectModel.ts` for the per-type expansion
// rules and which fields each one consumes.
export type EffectType =
  | "global-switch"
  | "dancer-wave"
  | "group-sequence"
  | "fast-part-chase"
  | "strobe";

// How dancers / groups are sequenced for wave + chase effects.
//   - "in-order"  → ascending by dancer.id (the natural "left-to-right")
//   - "reverse"   → descending (the natural "right-to-left")
//   - "custom"    → use the explicit `customOrder` array verbatim
export type EffectOrderMode = "in-order" | "reverse" | "custom";

// Per-step composition for dancer-wave:
//   - "one-by-one" → only the current dancer is lit at each sub-step
//   - "accumulate" → previously-lit dancers stay lit
export type EffectWaveMode = "one-by-one" | "accumulate";

export interface EffectConfig {
  effectType: EffectType;

  // dancer-wave / fast-part-chase ordering
  orderMode?: EffectOrderMode;
  customOrder?: number[];

  // dancer-wave composition
  mode?: EffectWaveMode;

  // group-sequence: each entry is a group of dancer ids lit together
  dancerGroups?: number[][];

  // Optional per-step color cycle. When omitted, every sub-step reuses the
  // parent action's `color`. When provided:
  //   - dancer-wave / fast-part-chase: one color per ordered dancer
  //   - group-sequence: one color per group
  //   - strobe: one color per blink
  //   - global-switch: ignored (use the parent action's `color`)
  colors?: ColorRGB[];

  // strobe-only
  blinkCount?: number;
  onRatio?: number;
  offRatio?: number;

  // Whether each generated sub-step prefixes a `fill_solid(... Black)`. The
  // expansion picks a per-effect-type default if this is unset.
  clearBeforeStep?: boolean;
}

// `clearBefore: true` → emit fill_solid(leds, NUM_LEDS, CRGB::Black) before
// the step's actions; emulates the Style B idiom used in playMain*().
// `durationBeats` is in units of one beat at the project's BPM. Fractional
// values supported (0.25, 0.5, 1, 2, 4 mapped per the Codebase Contract).
export interface DanceStep {
  id: string;
  durationBeats: number;
  clearBefore: boolean;
  actions: DanceAction[];
}

// Sections group steps for human navigation (Intro / Verse / Chorus / ...).
// The code generator emits one play<Dance>_<Section>() function per section.
//
// `startBeat` (optional) is the global beat at which this section starts on
// the dance's timeline. It's auto-computed by the migration helper from the
// accumulated durations of preceding steps; new dances can fill it in
// directly. Sections still drive code-generator function naming.
export interface DanceSection {
  id: string;
  name: string;
  steps: DanceStep[];
  startBeat?: number;
}

// One song. `bpm` becomes `#define BPM_<NAME>` in generated code.
// `beatUnit` is the editor's snap granularity in beat fractions (e.g. 0.25
// allows quarter-beat actions); it is metadata for the UI only.
export interface DanceProject {
  schemaVersion: number;
  type: "led-dance";
  id: string;
  name: string;
  bpm: number;
  beatUnit: number;
  dancers: Dancer[];
  sections: DanceSection[];
  customAnimations: CustomAnimation[];
  // When present, this is the canonical playback model and the code
  // generator will use it (sorted by startBeat). When absent, the legacy
  // section.steps[] fallback is used. Editor migrates legacy data on load.
  timelineEvents?: TimelineEvent[];
}
