import type { BodyPartName, ColorRGB, DanceAction, DanceStep, Dancer, TimelineEvent } from "@/types";
import {
  expandEffectAction,
  effectDefaultsFromAction,
  resolveActiveActionsAtBeat,
} from "./effectModel";

// One atomic preview slot for every visually-distinct region — chosen so
// every BodyPartName in BODY_PART_NAMES paints at least one specific slot
// (the user can therefore see exactly what their selected part would light
// up). Composite parts ("whole", "hat", "body", "arms", "hands", "legs",
// "feet", "leftArm", "rightArm") fan out to multiple atomic slots.
export const PREVIEW_SLOTS = [
  // Hat (3 zones, left → right)
  "beforeHatMark",
  "hatMark",
  "afterHatMark",
  // Torso (5 zones)
  "collar",
  "leftZipper",
  "shirt",
  "rightZipper",
  "lowerShirt",
  // Arms (6 zones)
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  // Crotch row (3 zones)
  "leftCrotch",
  "crotch",
  "rightCrotch",
  // Legs (2 zones)
  "leftLeg",
  "rightLeg",
  // Feet (2 zones)
  "leftFoot",
  "rightFoot",
] as const;
export type PreviewSlot = (typeof PREVIEW_SLOTS)[number];

// Exported so the BodyPartsSelector can derive the coverage hierarchy
// (which composite contains which atomic) without duplicating the table.
export const PART_TO_SLOTS: Record<BodyPartName, ReadonlyArray<PreviewSlot>> = {
  whole: PREVIEW_SLOTS,
  // Hat: composite "hat" lights all three zones; each mark targets just itself
  hat: ["beforeHatMark", "hatMark", "afterHatMark"],
  hatMark: ["hatMark"],
  beforeHatMark: ["beforeHatMark"],
  afterHatMark: ["afterHatMark"],
  // Torso: "body" lights everything torso-side, specific parts target their slot
  body: ["collar", "leftZipper", "shirt", "rightZipper", "lowerShirt"],
  shirt: ["shirt"],
  collar: ["collar"],
  lowerShirt: ["lowerShirt"],
  leftZipper: ["leftZipper"],
  rightZipper: ["rightZipper"],
  // Arms: composites cover their fan-out
  arms: [
    "leftUpperArm",
    "leftLowerArm",
    "rightUpperArm",
    "rightLowerArm",
  ],
  leftArm: ["leftUpperArm", "leftLowerArm"],
  rightArm: ["rightUpperArm", "rightLowerArm"],
  leftUpperArm: ["leftUpperArm"],
  leftLowerArm: ["leftLowerArm"],
  rightUpperArm: ["rightUpperArm"],
  rightLowerArm: ["rightLowerArm"],
  hands: ["leftHand", "rightHand"],
  leftHand: ["leftHand"],
  rightHand: ["rightHand"],
  // Legs: "legs" lights crotch + thigh strips; specific leg/crotch parts each
  // target their own slot. Crotch sub-zones are independent.
  legs: ["leftCrotch", "crotch", "rightCrotch", "leftLeg", "rightLeg"],
  leftLeg: ["leftLeg"],
  rightLeg: ["rightLeg"],
  crotch: ["crotch"],
  leftCrotch: ["leftCrotch"],
  rightCrotch: ["rightCrotch"],
  feet: ["leftFoot", "rightFoot"],
  leftFoot: ["leftFoot"],
  rightFoot: ["rightFoot"],
};

// True if `a` and `b` are along the same coverage branch — i.e. one is a
// composite that fully contains the other (e.g. arms ⊇ leftArm ⊇
// leftUpperArm). Used by BodyPartsSelector to keep the picked set tidy:
// when the user picks a specific part, any composite already covering it
// is removed; conversely picking a composite strips any specific subset
// already in the selection.
export function partsAreRelated(a: BodyPartName, b: BodyPartName): boolean {
  if (a === b) return true;
  const aSlots = new Set(PART_TO_SLOTS[a]);
  const bSlots = new Set(PART_TO_SLOTS[b]);
  return isSubset(aSlots, bSlots) || isSubset(bSlots, aSlots);
}

function isSubset<T>(small: ReadonlySet<T>, big: ReadonlySet<T>): boolean {
  for (const x of small) if (!big.has(x)) return false;
  return true;
}

export interface DancerDisplay {
  dancerId: number;
  name: string;
  slots: Partial<Record<PreviewSlot, ColorRGB>>;
  labels: string[];
}

// Flatten an action list so any effect actions surface as their first sub-
// step's contents. Used by `computeStepDisplay` which has no notion of "what
// beat are we at within this step" — picking sub-step 0 is the natural
// "what does this effect look like as a thumbnail" answer. Live timeline
// playback uses `computeTimelineDisplayAtBeat` instead, which DOES know the
// current beat and can pick the right sub-step.
function flattenForStepDisplay(actions: ReadonlyArray<DanceAction>): DanceAction[] {
  const out: DanceAction[] = [];
  for (const action of actions) {
    if (action.type !== "effect" || !action.effect) {
      out.push(action);
      continue;
    }
    const expanded = expandEffectAction(
      action.effect,
      // Synthetic duration: only the relative shape matters for thumbnails.
      Math.max(1, action.dancers.length || 1),
      effectDefaultsFromAction(action),
    );
    if (expanded.length > 0) out.push(...expanded[0]!.actions);
  }
  return out;
}

export function computeStepDisplay(
  step: DanceStep | null,
  dancers: ReadonlyArray<Dancer>,
): DancerDisplay[] {
  const flatActions = step ? flattenForStepDisplay(step.actions) : [];
  return dancers.map((dancer) => {
    const slots: Partial<Record<PreviewSlot, ColorRGB>> = {};
    const labels: string[] = [];

    for (const action of flatActions) {
      if (!action.dancers.includes(dancer.id)) continue;

      // Determine which slots to paint. Rainbow ignores part — codegen
      // emits Animation::Rainbow(duration) which paints the whole strip,
      // so the preview should match that behaviour.
      let parts: BodyPartName[];
      if (action.type === "animation" && action.animationId === "Rainbow") {
        parts = ["whole"];
      } else if (action.type === "static") {
        parts = action.parts ?? (action.part ? [action.part] : []);
      } else {
        parts = action.part ? [action.part] : [];
      }

      for (const part of parts) {
        const targetSlots = PART_TO_SLOTS[part] ?? [];
        for (const slot of targetSlots) {
          slots[slot] = action.color;
        }
      }

      if (action.type === "animation" && action.animationId) {
        if (!labels.includes(action.animationId)) {
          labels.push(action.animationId);
        }
      }
    }

    return { dancerId: dancer.id, name: dancer.name, slots, labels };
  });
}

// Walks the dance and returns its steps in playback order so the play
// controls can advance through them sequentially.
export function flattenSteps<T extends { sections: ReadonlyArray<{ steps: ReadonlyArray<DanceStep> }> }>(
  dance: T,
): DanceStep[] {
  const out: DanceStep[] = [];
  for (const section of dance.sections) {
    for (const step of section.steps) out.push(step);
  }
  return out;
}

// Computes per-dancer LED state at a given beat by overlaying every
// timeline event whose [startBeat, startBeat+durationBeats) range contains
// the beat. Events later in the array override earlier ones on the same
// slot — same painter's-algorithm semantics as the step-based renderer.
//
// Effect actions inside an event are resolved to their *currently active*
// sub-step (so a dancer-wave at 1/3 through its duration only paints the
// dancer whose slice covers that moment) via `resolveActiveActionsAtBeat`.
// We also surface a `fx: <effectType>` label on every dancer the effect
// addresses so the user can tell at a glance which figures are part of
// which effect (the colour alone wouldn't distinguish a hand-tuned static
// from a wave that just happens to be on its current dancer right now).
export function computeTimelineDisplayAtBeat(
  events: ReadonlyArray<TimelineEvent>,
  beat: number,
  dancers: ReadonlyArray<Dancer>,
): DancerDisplay[] {
  const active = events.filter(
    (e) => e.startBeat <= beat && beat < e.startBeat + e.durationBeats,
  );
  // For each active event, expand effect actions at the current local beat
  // offset so the preview matches what codegen will emit at that moment.
  const syntheticActions = active.flatMap((e) =>
    resolveActiveActionsAtBeat(e, beat - e.startBeat),
  );
  const synthetic: DanceStep = {
    id: "synthetic",
    durationBeats: 1,
    clearBefore: false,
    actions: syntheticActions,
  };
  const display = computeStepDisplay(synthetic, dancers);

  // Annotate every dancer that the active effect addresses with an "fx:"
  // chip — labelling the figure even when its sub-step happens to be OFF
  // (so the user can see the effect's footprint, not just the lit slice).
  for (const event of active) {
    for (const action of event.actions) {
      if (action.type !== "effect" || !action.effect) continue;
      const allDancersInEffect = collectEffectDancerIds(action);
      const label = `fx: ${action.effect.effectType}`;
      for (const d of display) {
        if (allDancersInEffect.has(d.dancerId) && !d.labels.includes(label)) {
          d.labels.push(label);
        }
      }
    }
  }
  return display;
}

// Every dancer id the effect could light at any sub-step. Pulls from the
// parent action's `dancers`, the effect's `dancerGroups`, and `customOrder`
// so the label correctly reflects "is this figure part of this effect at
// any point in its run".
function collectEffectDancerIds(action: DanceAction): Set<number> {
  const out = new Set<number>(action.dancers);
  const fx = action.effect;
  if (!fx) return out;
  if (fx.dancerGroups) {
    for (const g of fx.dancerGroups) for (const id of g) out.add(id);
  }
  if (fx.customOrder) {
    for (const id of fx.customOrder) out.add(id);
  }
  return out;
}
