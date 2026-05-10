// Body part names mirror BodyPart variables declared in light_dance_2026.ino
// (initializeLedRangeStarts). Adding a name here without a matching .ino
// declaration will produce C++ that fails to compile — keep in sync manually.

export const BODY_PART_NAMES = [
  "whole",
  "hat",
  "hatMark",
  "beforeHatMark",
  "afterHatMark",
  "body",
  "shirt",
  "collar",
  "lowerShirt",
  "leftZipper",
  "rightZipper",
  "arms",
  "leftArm",
  "rightArm",
  "leftUpperArm",
  "leftLowerArm",
  "rightUpperArm",
  "rightLowerArm",
  "hands",
  "leftHand",
  "rightHand",
  "legs",
  "leftLeg",
  "rightLeg",
  "crotch",
  "leftCrotch",
  "rightCrotch",
  "feet",
  "leftFoot",
  "rightFoot",
] as const;

export type BodyPartName = (typeof BODY_PART_NAMES)[number];

export function isBodyPartName(value: string): value is BodyPartName {
  return (BODY_PART_NAMES as readonly string[]).includes(value);
}
