import type { BodyPartName } from "@/types";

export const BODY_PART_GROUPS: ReadonlyArray<{ label: string; parts: BodyPartName[] }> = [
  { label: "All", parts: ["whole"] },
  { label: "Head", parts: ["hat", "hatMark", "beforeHatMark", "afterHatMark"] },
  {
    label: "Torso",
    parts: ["body", "shirt", "collar", "lowerShirt", "leftZipper", "rightZipper"],
  },
  {
    label: "Arms",
    parts: [
      "arms",
      "leftArm",
      "rightArm",
      "leftUpperArm",
      "leftLowerArm",
      "rightUpperArm",
      "rightLowerArm",
    ],
  },
  { label: "Hands", parts: ["hands", "leftHand", "rightHand"] },
  {
    label: "Legs",
    parts: ["legs", "leftLeg", "rightLeg", "crotch", "leftCrotch", "rightCrotch"],
  },
  { label: "Feet", parts: ["feet", "leftFoot", "rightFoot"] },
];
