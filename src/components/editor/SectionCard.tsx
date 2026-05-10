"use client";

import { useState } from "react";
import type { CustomAnimation, Dancer, DanceSection, DanceStep } from "@/types";
import { StepCard } from "./StepCard";
import { cloneStepWithNewIds, createEmptyStep } from "@/lib/editor/factories";

interface Props {
  section: DanceSection;
  dancers: Dancer[];
  customAnimations: CustomAnimation[];
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
  onChange: (next: DanceSection) => void;
  onDelete: () => void;
}

export function SectionCard({
  section,
  dancers,
  customAnimations,
  selectedStepId,
  onSelectStep,
  onChange,
  onDelete,
}: Props) {
  const updateStep = (id: string, next: DanceStep) =>
    onChange({ ...section, steps: section.steps.map((s) => (s.id === id ? next : s)) });

  const deleteStep = (id: string) =>
    onChange({ ...section, steps: section.steps.filter((s) => s.id !== id) });

  const duplicateStep = (id: string) => {
    const idx = section.steps.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const original = section.steps[idx];
    if (!original) return;
    const clone = cloneStepWithNewIds(original);
    const next = [...section.steps];
    next.splice(idx + 1, 0, clone);
    onChange({ ...section, steps: next });
  };

  const moveStep = (id: string, delta: -1 | 1) => {
    const idx = section.steps.findIndex((s) => s.id === id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= section.steps.length) return;
    const next = [...section.steps];
    const [moved] = next.splice(idx, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    onChange({ ...section, steps: next });
  };

  const addStep = () => onChange({ ...section, steps: [...section.steps, createEmptyStep()] });

  const [collapsed, setCollapsed] = useState(false);
  const totalBeats = section.steps.reduce((sum, s) => sum + (s.durationBeats || 0), 0);

  return (
    <div className="card" style={{ borderColor: "#94a3b8" }}>
      <div className="row" style={{ marginBottom: collapsed ? 0 : 10 }}>
        <button
          className="ghost"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand" : "Collapse"}
          style={{ width: 24, padding: "2px 4px" }}
        >
          {collapsed ? "▶" : "▼"}
        </button>
        <span className="group-label">section</span>
        <input
          value={section.name}
          onChange={(e) => onChange({ ...section, name: e.target.value })}
          style={{ flex: 1 }}
        />
        <span className="muted" style={{ fontSize: 12 }}>
          {section.steps.length} steps · {totalBeats} beats
        </span>
        <button className="danger" onClick={onDelete}>Delete section</button>
      </div>

      {!collapsed && (
        <div className="col" style={{ gap: 8 }}>
          {section.steps.map((step, i) => (
            <StepCard
              key={step.id}
              step={step}
              index={i}
              total={section.steps.length}
              dancers={dancers}
              customAnimations={customAnimations}
              selected={step.id === selectedStepId}
              onSelect={() => onSelectStep(step.id)}
              onChange={(next) => updateStep(step.id, next)}
              onDelete={() => deleteStep(step.id)}
              onDuplicate={() => duplicateStep(step.id)}
              onMoveUp={() => moveStep(step.id, -1)}
              onMoveDown={() => moveStep(step.id, 1)}
            />
          ))}
          <button onClick={addStep}>+ Add step</button>
        </div>
      )}
    </div>
  );
}
