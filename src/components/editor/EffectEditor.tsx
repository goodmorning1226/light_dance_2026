"use client";

import { useRef } from "react";
import type {
  EffectConfig,
  EffectOrderMode,
  EffectType,
  EffectWaveMode,
  Dancer,
} from "@/types";
import { createEmptyEffectConfig } from "@/lib/editor/factories";

interface Props {
  effect: EffectConfig;
  dancers: Dancer[];
  onChange: (next: EffectConfig) => void;
}

const EFFECT_TYPE_LABELS: Record<EffectType, string> = {
  "global-switch":   "Global switch — instant snapshot",
  "dancer-wave":     "Dancer wave — fire dancers in order",
  "group-sequence":  "Group sequence — fire groups in order",
  "fast-part-chase": "Fast part chase — chase a part across dancers",
  "strobe":          "Strobe — blink on/off N times",
};

const EFFECT_TYPE_HINTS: Record<EffectType, string> = {
  "global-switch":   "One sub-step covering the full duration. Uses the action's dancers + parts + color.",
  "dancer-wave":     "Splits the duration into one slice per dancer. Per-dancer dispatch is set by Order.",
  "group-sequence":  "One slice per group. Each group below lights together.",
  "fast-part-chase": "Like dancer-wave but typically targets a single small body part (hat, hands…).",
  "strobe":          "Cycles ON/OFF blinkCount times. ON portion uses the action's color; OFF uses black.",
};

// Renders the conditional fields a given effectType actually consumes.
// Fields that the chosen effect ignores are NOT rendered, so the form
// doesn't overwhelm the user with irrelevant inputs.
export function EffectEditor({ effect, dancers, onChange }: Props) {
  const setEffectType = (next: EffectType) => {
    if (next === effect.effectType) return;
    // Reset to type-appropriate defaults but carry over the user-specified
    // colors[] so they don't lose their palette if they switch types.
    const fresh = createEmptyEffectConfig(next);
    if (effect.colors) fresh.colors = effect.colors;
    onChange(fresh);
  };

  const patch = (delta: Partial<EffectConfig>) => onChange({ ...effect, ...delta });

  const showOrder =
    effect.effectType === "dancer-wave" || effect.effectType === "fast-part-chase";
  const showCustomOrder = showOrder && effect.orderMode === "custom";
  const showMode = effect.effectType === "dancer-wave";
  const showGroups = effect.effectType === "group-sequence";
  const showStrobe = effect.effectType === "strobe";

  return (
    <div
      className="col"
      style={{
        gap: 8,
        padding: 10,
        background: "var(--color-surface-2)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border)",
      }}
    >
      <Field label="Effect type">
        <select
          value={effect.effectType}
          onChange={(e) => setEffectType(e.target.value as EffectType)}
        >
          {(Object.keys(EFFECT_TYPE_LABELS) as EffectType[]).map((t) => (
            <option key={t} value={t}>{EFFECT_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </Field>
      <span className="muted" style={{ fontSize: 11, marginTop: -2 }}>
        {EFFECT_TYPE_HINTS[effect.effectType]}
      </span>

      {showOrder && (
        <Field label="Order">
          <select
            value={effect.orderMode ?? "in-order"}
            onChange={(e) => patch({ orderMode: e.target.value as EffectOrderMode })}
          >
            <option value="in-order">in-order (low → high id)</option>
            <option value="reverse">reverse (high → low id)</option>
            <option value="custom">custom (drag to arrange)</option>
          </select>
        </Field>
      )}

      {showCustomOrder && (
        <Field label="Custom order">
          <DancerOrderEditor
            dancers={dancers}
            order={effect.customOrder ?? []}
            onChange={(next) => patch({ customOrder: next })}
          />
        </Field>
      )}

      {showMode && (
        <Field label="Mode">
          <select
            value={effect.mode ?? "one-by-one"}
            onChange={(e) => patch({ mode: e.target.value as EffectWaveMode })}
          >
            <option value="one-by-one">one-by-one (only current dancer lit)</option>
            <option value="accumulate">accumulate (previous dancers stay lit)</option>
          </select>
        </Field>
      )}

      {showGroups && (
        <Field label="Dancer groups (each group lights together; groups fire in order)">
          <GroupsEditor
            groups={effect.dancerGroups ?? []}
            dancers={dancers}
            onChange={(g) => patch({ dancerGroups: g })}
          />
        </Field>
      )}

      {showStrobe && (
        <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
          <Field label="Blink count">
            <input
              type="number"
              min={1}
              step={1}
              value={effect.blinkCount ?? 4}
              onChange={(e) =>
                patch({ blinkCount: Math.max(1, Number.parseInt(e.target.value, 10) || 1) })
              }
              style={{ width: 80 }}
            />
          </Field>
          <Field label="On ratio">
            <input
              type="number"
              min={0}
              step={0.1}
              value={effect.onRatio ?? 0.5}
              onChange={(e) => patch({ onRatio: Number.parseFloat(e.target.value) })}
              style={{ width: 80 }}
            />
          </Field>
          <Field label="Off ratio">
            <input
              type="number"
              min={0}
              step={0.1}
              value={effect.offRatio ?? 0.5}
              onChange={(e) => patch({ offRatio: Number.parseFloat(e.target.value) })}
              style={{ width: 80 }}
            />
          </Field>
        </div>
      )}

      <Field label="Clear before each sub-step">
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={effect.clearBeforeStep ?? false}
            onChange={(e) => patch({ clearBeforeStep: e.target.checked })}
          />
          <span className="muted" style={{ fontSize: 11 }}>
            Forces fill_solid(... Black) at the start of every emission. Default per
            effect: wave / chase / group-sequence ON, strobe OFF, global-switch ON.
          </span>
        </label>
      </Field>
    </div>
  );
}

// ───────────────── DancerOrderEditor ─────────────────
// Drag-to-arrange ordered chip list. Click an unselected chip to append it
// to the order; drag a selected chip to reorder; click ✕ to remove. Avoids
// keyboard input entirely (which broke for users whose IME ate the comma).
function DancerOrderEditor({
  dancers,
  order,
  onChange,
}: {
  dancers: Dancer[];
  order: number[];
  onChange: (next: number[]) => void;
}) {
  const orderedSet = new Set(order);
  const remaining = dancers.filter((d) => !orderedSet.has(d.id));
  const dragIndexRef = useRef<number | null>(null);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    const a = next[i]!;
    next[i] = next[j]!;
    next[j] = a;
    onChange(next);
  };
  const removeAt = (i: number) => onChange(order.filter((_, idx) => idx !== i));
  const add = (id: number) => onChange([...order, id]);
  const clear = () => onChange([]);

  // HTML5 drag API: swap on dragOver against the hover index. We mutate the
  // order live during drag so the user sees the reorder as they move.
  const onDragStart = (i: number) => (e: React.DragEvent<HTMLSpanElement>) => {
    dragIndexRef.current = i;
    e.dataTransfer.effectAllowed = "move";
    // Firefox needs setData to actually start a drag.
    e.dataTransfer.setData("text/plain", String(i));
  };
  const onDragOver = (i: number) => (e: React.DragEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const from = dragIndexRef.current;
    if (from === null || from === i) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved!);
    dragIndexRef.current = i;
    onChange(next);
  };
  const onDragEnd = () => {
    dragIndexRef.current = null;
  };

  return (
    <div className="col" style={{ gap: 6 }}>
      {/* Ordered chips */}
      <div
        className="row"
        style={{
          flexWrap: "wrap",
          gap: 6,
          minHeight: 36,
          padding: 6,
          background: "var(--color-surface)",
          border: "1px dashed var(--color-border-strong)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        {order.length === 0 && (
          <span className="muted" style={{ fontSize: 11, alignSelf: "center" }}>
            (empty — click a dancer below to add to the order)
          </span>
        )}
        {order.map((id, i) => {
          const dancer = dancers.find((d) => d.id === id);
          const label = dancer ? `${dancer.id}. ${dancer.name}` : `#${id} (missing)`;
          return (
            <span
              key={`${id}-${i}`}
              draggable
              onDragStart={onDragStart(i)}
              onDragOver={onDragOver(i)}
              onDragEnd={onDragEnd}
              title="Drag to reorder"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 4px 3px 10px",
                background: "var(--color-brand)",
                color: "white",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                cursor: "grab",
                userSelect: "none",
                boxShadow: "var(--shadow-xs)",
              }}
            >
              <span
                style={{
                  background: "rgba(255,255,255,0.2)",
                  padding: "1px 6px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {i + 1}
              </span>
              <span>{label}</span>
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                title="Move left"
                style={miniBtn}
              >
                ←
              </button>
              <button
                onClick={() => move(i, +1)}
                disabled={i === order.length - 1}
                title="Move right"
                style={miniBtn}
              >
                →
              </button>
              <button
                onClick={() => removeAt(i)}
                title="Remove from order"
                style={{ ...miniBtn, color: "#fecdd3" }}
              >
                ✕
              </button>
            </span>
          );
        })}
      </div>

      {/* Add row */}
      <div className="row" style={{ flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        <span className="group-label">Add</span>
        {remaining.length === 0 ? (
          <span className="muted" style={{ fontSize: 11 }}>
            (every dancer is already in the order)
          </span>
        ) : (
          remaining.map((d) => (
            <span
              key={d.id}
              className="chip"
              onClick={() => add(d.id)}
              role="button"
              title={`Append ${d.name} to the order`}
            >
              + {d.id}. {d.name}
            </span>
          ))
        )}
        {order.length > 0 && (
          <>
            <span className="spacer" />
            <button className="ghost" onClick={clear} title="Clear order">
              clear all
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  border: "none",
  color: "white",
  padding: "0 6px",
  height: 20,
  borderRadius: 999,
  fontSize: 11,
  cursor: "pointer",
  lineHeight: 1,
};

// ───────────────────────── GroupsEditor ──────────────────────────────────
// Each row is one group. Within a row, dancers are picked by clicking chips
// (no text input). Rows can be reordered with ↑ / ↓ and removed with ✕.
function GroupsEditor({
  groups,
  dancers,
  onChange,
}: {
  groups: number[][];
  dancers: Dancer[];
  onChange: (next: number[][]) => void;
}) {
  const addRow = () => onChange([...groups, []]);
  const removeRow = (i: number) =>
    onChange(groups.filter((_, idx) => idx !== i));
  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= groups.length) return;
    const next = [...groups];
    const a = next[i]!;
    next[i] = next[j]!;
    next[j] = a;
    onChange(next);
  };
  const setRow = (i: number, ids: number[]) => {
    const next = [...groups];
    next[i] = ids;
    onChange(next);
  };

  return (
    <div className="col" style={{ gap: 6 }}>
      {groups.length === 0 && (
        <span className="muted" style={{ fontSize: 11 }}>
          No groups yet. Click + Add group to start.
        </span>
      )}
      {groups.map((row, i) => (
        <div
          key={i}
          className="row"
          style={{
            gap: 6,
            padding: 6,
            background: "var(--color-surface)",
            border: "1px dashed var(--color-border-strong)",
            borderRadius: "var(--radius-sm)",
            alignItems: "flex-start",
          }}
        >
          <span
            className="group-label"
            style={{ minWidth: 28, textAlign: "right", paddingTop: 6 }}
          >
            #{i + 1}
          </span>
          <div style={{ flex: 1 }}>
            <GroupDancerPicker
              dancers={dancers}
              selected={row}
              onChange={(ids) => setRow(i, ids)}
            />
          </div>
          <div className="col" style={{ gap: 2 }}>
            <button onClick={() => moveRow(i, -1)} disabled={i === 0} title="Move up">↑</button>
            <button onClick={() => moveRow(i, +1)} disabled={i === groups.length - 1} title="Move down">↓</button>
            <button className="ghost danger" onClick={() => removeRow(i)} title="Remove group">✕</button>
          </div>
        </div>
      ))}
      <div className="row" style={{ gap: 6 }}>
        <button onClick={addRow}>+ Add group</button>
        <span className="muted" style={{ fontSize: 11 }}>
          Within each group dancers light together; groups fire in the order shown.
        </span>
      </div>
    </div>
  );
}

// Click-to-toggle chips for one group. Order within the group doesn't
// affect playback — they all light at the same sub-step — so we don't
// expose reorder controls here (keeps it lightweight).
function GroupDancerPicker({
  dancers,
  selected,
  onChange,
}: {
  dancers: Dancer[];
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  const toggle = (id: number) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id].sort((a, b) => a - b));
  };
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
      {dancers.length === 0 && (
        <span className="muted" style={{ fontSize: 11 }}>(no dancers)</span>
      )}
      {dancers.map((d) => {
        const on = selected.includes(d.id);
        return (
          <span
            key={d.id}
            className={`chip${on ? " on" : ""}`}
            onClick={() => toggle(d.id)}
            role="checkbox"
            aria-checked={on}
          >
            {d.id}. {d.name}
          </span>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <span className="group-label">{label}</span>
      {children}
    </div>
  );
}
