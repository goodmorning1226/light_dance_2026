"use client";

import type { BodyPartName } from "@/types";
import { BODY_PART_GROUPS } from "@/lib/editor/bodyPartGroups";
import { partsAreRelated } from "@/lib/editor/previewModel";

interface Props {
  mode: "single" | "multi";
  value: BodyPartName[];
  onChange: (next: BodyPartName[]) => void;
}

export function BodyPartsSelector({ mode, value, onChange }: Props) {
  // Keep the selection along a single coverage branch:
  //   - Picking "leftUpperArm" while [arms] is selected → strip arms (it
  //     already covered leftUpperArm; keeping both is redundant + double
  //     paints in the codegen)
  //   - Picking "arms" while [leftUpperArm, leftLowerArm] is selected →
  //     strip both (arms now covers them)
  //   - Picking "whole" → clears everything else (whole covers all parts)
  //   - Picking any specific while "whole" is selected → strip whole
  //
  // Mechanically we just remove every part already in the selection that is
  // related-by-coverage to the new pick (one is a subset of the other),
  // then add the new pick. Equivalent body parts (different names, same
  // coverage) don't exist in the table, so this is unambiguous.
  const toggle = (part: BodyPartName) => {
    if (mode === "single") {
      onChange([part]);
      return;
    }
    if (value.includes(part)) {
      onChange(value.filter((p) => p !== part));
      return;
    }
    const filtered = value.filter((q) => !partsAreRelated(q, part));
    onChange([...filtered, part]);
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
