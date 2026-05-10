import type { ColorRGB } from "@/types";

export function rgbToHex(c: ColorRGB): string {
  const channel = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${channel(c.r)}${channel(c.g)}${channel(c.b)}`;
}

export function hexToRgb(hex: string): ColorRGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const matched = m?.[1];
  if (!matched) return { r: 0, g: 0, b: 0 };
  const v = parseInt(matched, 16);
  return {
    r: (v >> 16) & 0xff,
    g: (v >> 8) & 0xff,
    b: v & 0xff,
  };
}
