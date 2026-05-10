import type { BodyPartName, ColorRGB, DanceStep, Dancer, TimelineEvent } from "@/types";

// The 8 simplified slots used by the visual preview, vs. the 30 BodyPartName
// values the .ino library actually controls. The mapping table below collapses
// each detailed part to the matching simplified slot(s).
export const PREVIEW_SLOTS = [
  "hat",
  "body",
  "leftArm",
  "rightArm",
  "leftHand",
  "rightHand",
  "legs",
  "feet",
] as const;
export type PreviewSlot = (typeof PREVIEW_SLOTS)[number];

const PART_TO_SLOTS: Record<BodyPartName, ReadonlyArray<PreviewSlot>> = {
  whole: PREVIEW_SLOTS,
  hat: ["hat"],
  hatMark: ["hat"],
  beforeHatMark: ["hat"],
  afterHatMark: ["hat"],
  body: ["body"],
  shirt: ["body"],
  collar: ["body"],
  lowerShirt: ["body"],
  leftZipper: ["body"],
  rightZipper: ["body"],
  arms: ["leftArm", "rightArm"],
  leftArm: ["leftArm"],
  leftUpperArm: ["leftArm"],
  leftLowerArm: ["leftArm"],
  rightArm: ["rightArm"],
  rightUpperArm: ["rightArm"],
  rightLowerArm: ["rightArm"],
  hands: ["leftHand", "rightHand"],
  leftHand: ["leftHand"],
  rightHand: ["rightHand"],
  legs: ["legs"],
  leftLeg: ["legs"],
  rightLeg: ["legs"],
  crotch: ["legs"],
  leftCrotch: ["legs"],
  rightCrotch: ["legs"],
  feet: ["feet"],
  leftFoot: ["feet"],
  rightFoot: ["feet"],
};

export interface DancerDisplay {
  dancerId: number;
  name: string;
  slots: Partial<Record<PreviewSlot, ColorRGB>>;
  labels: string[];
}

export function computeStepDisplay(
  step: DanceStep | null,
  dancers: ReadonlyArray<Dancer>,
): DancerDisplay[] {
  return dancers.map((dancer) => {
    const slots: Partial<Record<PreviewSlot, ColorRGB>> = {};
    const labels: string[] = [];

    if (step) {
      for (const action of step.actions) {
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
export function computeTimelineDisplayAtBeat(
  events: ReadonlyArray<TimelineEvent>,
  beat: number,
  dancers: ReadonlyArray<Dancer>,
): DancerDisplay[] {
  const active = events.filter(
    (e) => e.startBeat <= beat && beat < e.startBeat + e.durationBeats,
  );
  // Reuse the existing per-step display logic by constructing a synthetic
  // step containing all active events' actions.
  const syntheticActions = active.flatMap((e) => e.actions);
  const synthetic: DanceStep = {
    id: "synthetic",
    durationBeats: 1,
    clearBefore: false,
    actions: syntheticActions,
  };
  return computeStepDisplay(synthetic, dancers);
}
