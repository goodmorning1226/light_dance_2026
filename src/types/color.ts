// 24-bit RGB color matching FastLED's CRGB(r, g, b). Each channel 0-255.
// The code generator will emit `CRGB(r, g, b)` literals from these values.

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

export const BLACK: ColorRGB = { r: 0, g: 0, b: 0 };
