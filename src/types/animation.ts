// Built-in animation kinds correspond to the static factory methods on the
// Animation class in light_dance_2026.ino (Animation::ShowColor, ::LTR, ...).
// "ShowColorSet" is also a real factory in the .ino but is left out of the
// editor's first-class set since the editor models colors per body part rather
// than as named ColorSet structs.

export const BUILT_IN_ANIMATION_IDS = [
  "ShowColor",
  "LTR",
  "RTL",
  "Center",
  "Rainbow",
  "Multi",
  "Sequential",
] as const;

export type BuiltInAnimationId = (typeof BUILT_IN_ANIMATION_IDS)[number];

export function isBuiltInAnimationId(value: string): value is BuiltInAnimationId {
  return (BUILT_IN_ANIMATION_IDS as readonly string[]).includes(value);
}
