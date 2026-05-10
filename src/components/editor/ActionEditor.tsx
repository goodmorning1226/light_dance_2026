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
  // Hide the dancer-selection field. Used for personal events (the dancer is
  // implicit from the event's lockedDancerId) and inside the Common Event
  // modal (each selected dancer gets a copy of the action on Apply).
  hideDancers?: boolean;
}

// Multi / Sequential live in BuiltInAnimationId but require a sub-animation
// editor that is out of scope for v1; hide them so users can't pick what we
// can't render.
const SELECTABLE_BUILT_INS = BUILT_IN_ANIMATION_IDS.filter(
  (id) => id !== "Multi" && id !== "Sequential",
);

const ANIMATIONS_NEEDING_PART = new Set(["ShowColor", "LTR", "RTL", "Center"]);

export function ActionEditor({
  action,
  dancers,
  customAnimations,
  onChange,
  onDelete,
  hideDancers,
}: Props) {
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

  // Convert between static and animation. Drops fields incompatible with the
  // target type and seeds defaults so the action is immediately valid.
  const setActionType = (next: "static" | "animation") => {
    if (next === action.type) return;
    if (next === "static") {
      const converted: DanceAction = {
        type: "static",
        dancers: action.dancers,
        color: action.color,
        parts: action.parts ?? (action.part ? [action.part] : ["whole"]),
      };
      onChange(converted);
    } else {
      const converted: DanceAction = {
        type: "animation",
        dancers: action.dancers,
        color: action.color,
        part: action.part ?? action.parts?.[0] ?? "whole",
        animationId: action.animationId ?? "ShowColor",
      };
      onChange(converted);
    }
  };

  const isAnimation = action.type === "animation";
  const animId = action.animationId ?? "ShowColor";
  const showPartSelector =
    !isAnimation || ANIMATIONS_NEEDING_PART.has(animId) || isCustom(animId, customAnimations);

  return (
    <div
      className="card"
      style={{ background: isAnimation ? "#fef3c7" : "#dbeafe", borderColor: "transparent" }}
    >
      <div className="row" style={{ marginBottom: 6, gap: 6 }}>
        <select
          value={action.type}
          onChange={(e) => setActionType(e.target.value as "static" | "animation")}
          title="Switch action type"
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.05,
            background: "transparent",
            border: "1px solid #94a3b8",
            borderRadius: 4,
            padding: "2px 6px",
          }}
        >
          <option value="static">static</option>
          <option value="animation">animation</option>
        </select>
        <span className="spacer" />
        <button className="ghost danger" onClick={onDelete} title="Delete action">
          ✕
        </button>
      </div>

      <div className="col" style={{ gap: 8 }}>
        {!hideDancers && (
          <Field label="Dancers">
            <DancersCheckboxes dancers={dancers} selected={action.dancers} onChange={setDancers} />
          </Field>
        )}

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
