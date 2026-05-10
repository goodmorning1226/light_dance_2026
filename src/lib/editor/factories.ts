import type { DanceAction, Dancer, DanceProject, DanceSection, DanceStep } from "@/types";
import { createId } from "@/lib/storage";

export function createEmptyDance(): DanceProject {
  return {
    schemaVersion: 1,
    type: "led-dance",
    id: createId("dance"),
    name: "New Dance",
    bpm: 120,
    beatUnit: 0.5,
    dancers: [
      { id: 1, name: "Dancer 1" },
      { id: 2, name: "Dancer 2" },
      { id: 3, name: "Dancer 3" },
    ],
    sections: [createEmptySection("Intro")],
    customAnimations: [],
  };
}

export function createEmptyDancer(existingIds: number[]): Dancer {
  let nextId = 1;
  while (existingIds.includes(nextId)) nextId++;
  return { id: nextId, name: `Dancer ${nextId}` };
}

export function createEmptySection(name = "New Section"): DanceSection {
  return {
    id: createId("section"),
    name,
    steps: [createEmptyStep()],
  };
}

export function createEmptyStep(): DanceStep {
  return {
    id: createId("step"),
    durationBeats: 1,
    clearBefore: true,
    actions: [],
  };
}

export function cloneStepWithNewIds(step: DanceStep): DanceStep {
  return {
    id: createId("step"),
    durationBeats: step.durationBeats,
    clearBefore: step.clearBefore,
    actions: step.actions.map((a) => JSON.parse(JSON.stringify(a)) as DanceAction),
  };
}

export function createEmptyStaticAction(): DanceAction {
  return {
    type: "static",
    dancers: [],
    parts: ["whole"],
    color: { r: 255, g: 255, b: 255 },
  };
}

export function createEmptyAnimationAction(): DanceAction {
  return {
    type: "animation",
    dancers: [],
    part: "whole",
    color: { r: 255, g: 255, b: 255 },
    animationId: "ShowColor",
  };
}
