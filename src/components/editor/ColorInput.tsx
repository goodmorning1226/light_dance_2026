"use client";

import type { ColorRGB } from "@/types";
import { hexToRgb, rgbToHex } from "@/lib/editor/colorConvert";

interface Props {
  value: ColorRGB;
  onChange: (next: ColorRGB) => void;
}

export function ColorInput({ value, onChange }: Props) {
  const hex = rgbToHex(value);
  return (
    <div className="row" style={{ gap: 6 }}>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(hexToRgb(e.target.value))}
        style={{ width: 36, height: 28, padding: 0, border: "1px solid #cbd5e1" }}
      />
      <span className="muted" style={{ fontFamily: "monospace" }}>
        rgb({value.r}, {value.g}, {value.b})
      </span>
    </div>
  );
}
