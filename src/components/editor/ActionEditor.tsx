"use client";

import {
  BUILT_IN_ANIMATION_IDS,
  type BodyPartName,
  type ColorRGB,
  type CustomAnimation,
  type DanceAction,
  type Dancer,
} from "@/types";
import { ColorInput } from "./ColorInput";
import { DancersCheckboxes } from "./DancersCheckboxes";
import { BodyPartsSelector } from "./BodyPartsSelector";

interface Props {
  action: DanceAction;
  dancers: Dancer[];
  customAnimations: CustomAnimation[];
  onChange: (next: DanceAction) => void;
  onDelete: () => void;
}

// Multi / Sequential live in BuiltInAnimationId but require a sub-animation
// editor that is out of scope for v1; hide them so users can't pick what we
// can't render.
const SELECTABLE_BUILT_INS = BUILT_IN_ANIMATION_IDS.filter(
  (id) => id !== "Multi" && id !== "Sequential",
);

const ANIMATIONS_NEEDING_PART = new Set(["ShowColor", "LTR", "RTL", "Center"]);

export function ActionEditor({ action, dancers, customAnimations, onChange, onDelete }: Props) {
  const setDancers = (next: number[]) => onChange({ ...action, dancers: next });
  const setColor = (next: ColorRGB) => onChange({ ...action, color: next });

  const setParts = (next: BodyPartName[]) => {
    const updated: DanceAction = { ...action, parts: next };
    return onChange(updated);
  };
  const setPart = (next: BodyPartName[]) => {
    const first = next[0];
    if (!first) return;
    onChange({ ...action, part: first });
  };

  const setAnimationId = (id: string) => {
    onChange({ ...action, animationId: id });
  };

  const isAnimation = action.type === "animation";
  const animId = action.animationId ?? "ShowColor";
  const showPartSelector = !isAnimation || ANIMATIONS_NEEDING_PART.has(animId) || isCustom(animId, customAnimations);

  return (
    <div
      className="card"
      style={{ background: isAnimation ? "#fef3c7" : "#dbeafe", borderColor: "transparent" }}
    >
      <div className="row" style={{ marginBottom: 6 }}>
        <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.05 }}>
          {action.type}
        </strong>
        <span className="spacer" />
        <button className="ghost danger" onClick={onDelete} title="Delete action">
          ✕
        </button>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <Field label="Dancers">
          <DancersCheckboxes dancers={dancers} selected={action.dancers} onChange={setDancers} />
        </Field>

        {isAnimation && (
          <Field label="Animation">
            <select value={animId} onChange={(e) => setAnimationId(e.target.value)}>
              <optgroup label="Built-in">
                {SELECTABLE_BUILT_INS.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </optgroup>
              {customAnimations.length > 0 && (
                <optgroup label="Custom">
                  {customAnimations.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
        )}

        {showPartSelector && (
          <Field label={isAnimation ? "Body part" : "Body parts"}>
            <BodyPartsSelector
              mode={isAnimation ? "single" : "multi"}
              value={isAnimation ? (action.part ? [action.part] : []) : (action.parts ?? [])}
              onChange={isAnimation ? setPart : setParts}
            />
          </Field>
        )}

        <Field label="Color">
          <ColorInput value={action.color} onChange={setColor} />
        </Field>
      </div>
    </div>
  );
}

function isCustom(animId: string, customs: CustomAnimation[]): boolean {
  return customs.some((c) => c.id === animId);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <span className="group-label">{label}</span>
      {children}
    </div>
  );
}
