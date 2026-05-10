import type { DanceProject } from "@/types";

export const sampleDanceProject: DanceProject = {
  schemaVersion: 1,
  type: "led-dance",
  id: "dance-sample-001",
  name: "Sample Dance",
  bpm: 125,
  beatUnit: 0.5,
  dancers: [
    { id: 1, name: "花花" },
    { id: 2, name: "徐舒庭" },
    { id: 3, name: "小米" },
  ],
  customAnimations: [],
  sections: [
    {
      id: "section-intro",
      name: "Intro",
      steps: [
        {
          id: "step-intro-1",
          durationBeats: 2,
          clearBefore: true,
          actions: [
            {
              type: "static",
              dancers: [1, 2, 3],
              parts: ["whole"],
              color: { r: 255, g: 255, b: 255 },
            },
          ],
        },
        {
          id: "step-intro-2",
          durationBeats: 4,
          clearBefore: true,
          actions: [
            {
              type: "animation",
              dancers: [1, 2, 3],
              part: "whole",
              color: { r: 0, g: 0, b: 0 },
              animationId: "Rainbow",
            },
          ],
        },
      ],
    },
    {
      id: "section-chorus",
      name: "Chorus",
      steps: [
        {
          id: "step-chorus-1",
          durationBeats: 2,
          clearBefore: true,
          actions: [
            {
              type: "animation",
              dancers: [1],
              part: "arms",
              color: { r: 221, g: 47, b: 247 },
              animationId: "LTR",
            },
          ],
        },
        {
          id: "step-chorus-2",
          durationBeats: 2,
          clearBefore: false,
          actions: [
            {
              type: "static",
              dancers: [2, 3],
              parts: ["body", "hat"],
              color: { r: 255, g: 230, b: 25 },
            },
            {
              type: "static",
              dancers: [1],
              parts: ["hands"],
              color: { r: 255, g: 10, b: 10 },
            },
          ],
        },
      ],
    },
  ],
};
