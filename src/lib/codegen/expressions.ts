import type { ColorRGB } from "@/types";

export function durationToCppExpression(durationBeats: number, beatTimeName: string): string {
  if (durationBeats <= 0) return "0";
  if (durationBeats === 1) return beatTimeName;
  if (Number.isInteger(durationBeats)) return `${durationBeats} * ${beatTimeName}`;

  const halves = durationBeats * 2;
  if (Number.isInteger(halves) && halves > 0) {
    return halves === 1 ? `${beatTimeName} / 2` : `${halves} * ${beatTimeName} / 2`;
  }
  const quarters = durationBeats * 4;
  if (Number.isInteger(quarters) && quarters > 0) {
    return quarters === 1 ? `${beatTimeName} / 4` : `${quarters} * ${beatTimeName} / 4`;
  }
  return `(int)(${durationBeats} * ${beatTimeName})`;
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function colorToCpp(color: ColorRGB): string {
  return `CRGB(${clamp255(color.r)}, ${clamp255(color.g)}, ${clamp255(color.b)})`;
}

export function dancerConditionToCpp(dancers: number[]): string {
  if (dancers.length === 0) return "false";
  return dancers.map((d) => `DANCER == ${d}`).join(" || ");
}
