"use client";

import type { BodyPartName } from "@/types";
import { BODY_PART_GROUPS } from "@/lib/editor/bodyPartGroups";

interface Props {
  mode: "single" | "multi";
  value: BodyPartName[];
  onChange: (next: BodyPartName[]) => void;
}

export function BodyPartsSelector({ mode, value, onChange }: Props) {
  const toggle = (part: BodyPartName) => {
    if (mode === "single") {
      onChange([part]);
      return;
    }
    if (value.includes(part)) onChange(value.filter((p) => p !== part));
    else onChange([...value, part]);
  };

  return (
    <div className="col" style={{ gap: 4 }}>
      {BODY_PART_GROUPS.map((group) => (
        <div key={group.label} className="row" style={{ flexWrap: "wrap", gap: 4 }}>
          <span className="group-label" style={{ width: 50, flexShrink: 0 }}>
            {group.label}
          </span>
          {group.parts.map((part) => {
            const on = value.includes(part);
            return (
              <span
                key={part}
                className={`chip${on ? " on" : ""}`}
                onClick={() => toggle(part)}
                role={mode === "multi" ? "checkbox" : "radio"}
                aria-checked={on}
              >
                {part}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
