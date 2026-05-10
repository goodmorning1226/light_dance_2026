"use client";

import { useState } from "react";
import type { CustomAnimation, DanceAction, Dancer, DanceStep } from "@/types";
import { ActionEditor } from "./ActionEditor";
import { createEmptyAnimationAction, createEmptyStaticAction } from "@/lib/editor/factories";

interface Props {
  step: DanceStep;
  index: number;
  total: number;
  dancers: Dancer[];
  customAnimations: CustomAnimation[];
  selected: boolean;
  onSelect: () => void;
  onChange: (next: DanceStep) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function summariseActions(actions: ReadonlyArray<DanceAction>): string {
  if (actions.length === 0) return "no actions";
  const staticCount = actions.filter((a) => a.type === "static").length;
  const animCount = actions.filter((a) => a.type === "animation").length;
  const parts: string[] = [];
  if (staticCount > 0) parts.push(`${staticCount} static`);
  if (animCount > 0) parts.push(`${animCount} animation`);
  return parts.join(" · ");
}

export function StepCard({
  step,
  index,
  total,
  dancers,
  customAnimations,
  selected,
  onSelect,
  onChange,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const updateAction = (idx: number, next: DanceAction) =>
    onChange({ ...step, actions: step.actions.map((a, i) => (i === idx ? next : a)) });

  const deleteAction = (idx: number) =>
    onChange({ ...step, actions: step.actions.filter((_, i) => i !== idx) });

  const addAction = (kind: "static" | "animation") => {
    const next = kind === "static" ? createEmptyStaticAction() : createEmptyAnimationAction();
    onChange({ ...step, actions: [...step.actions, next] });
  };

  return (
    <div
      className="card"
      style={{
        background: "#f8fafc",
        borderLeft: selected ? "4px solid #1f6feb" : "4px solid transparent",
        boxShadow: selected ? "0 0 0 1px #1f6feb" : undefined,
        transition: "border-color 0.1s, box-shadow 0.1s",
      }}
    >
      <div className="row" style={{ marginBottom: collapsed ? 0 : 8 }}>
        <button
          className="ghost"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand" : "Collapse"}
          style={{ width: 24, padding: "2px 4px" }}
        >
          {collapsed ? "▶" : "▼"}
        </button>
        <strong>Step {index + 1}</strong>
        {collapsed ? (
          <span className="muted" style={{ fontSize: 12 }}>
            {step.durationBeats}b
            {step.clearBefore ? " · clear" : ""}
            {" · "}
            {summariseActions(step.actions)}
          </span>
        ) : (
          <span className="muted" style={{ fontFamily: "monospace" }}>{step.id}</span>
        )}
        <span className="spacer" />
        <button
          className={selected ? "primary" : ""}
          onClick={onSelect}
          title={selected ? "Currently shown in visual preview" : "Show this step in visual preview"}
        >
          👁
        </button>
        <button onClick={onMoveUp} disabled={index === 0} title="Move up">↑</button>
        <button onClick={onMoveDown} disabled={index === total - 1} title="Move down">↓</button>
        <button onClick={onDuplicate} title="Duplicate">⧉</button>
        <button className="danger" onClick={onDelete} title="Delete">✕</button>
      </div>

      {!collapsed && (
        <>
          <div className="row" style={{ gap: 16, marginBottom: 8 }}>
            <label className="row" style={{ gap: 6 }}>
              <span className="group-label">durationBeats</span>
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={step.durationBeats}
                onChange={(e) => onChange({ ...step, durationBeats: Number(e.target.value) || 0 })}
                style={{ width: 80 }}
              />
            </label>
            <label className="row" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={step.clearBefore}
                onChange={(e) => onChange({ ...step, clearBefore: e.target.checked })}
              />
              <span className="group-label">clearBefore</span>
            </label>
          </div>

          <div className="col" style={{ gap: 6 }}>
            {step.actions.map((action, i) => (
              <ActionEditor
                key={i}
                action={action}
                dancers={dancers}
                customAnimations={customAnimations}
                onChange={(next) => updateAction(i, next)}
                onDelete={() => deleteAction(i)}
              />
            ))}
            <div className="row" style={{ gap: 6 }}>
              <button onClick={() => addAction("static")}>+ static action</button>
              <button onClick={() => addAction("animation")}>+ animation action</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
