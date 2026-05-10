"use client";

import { useEffect, useState } from "react";
import type {
  CustomAnimation,
  DanceAction,
  DanceProject,
  EffectConfig,
  TimelineEvent,
} from "@/types";
import { ActionEditor } from "./ActionEditor";
import { EffectEditor } from "./EffectEditor";
import {
  createEmptyAnimationAction,
  createEmptyEffectAction,
  createEmptyEffectConfig,
  createEmptyStaticAction,
} from "@/lib/editor/factories";
import {
  findSectionForBeat,
  hasOverlapForDancer,
  snapBeat,
} from "@/lib/editor/timelineHelpers";

// The modal opens in one of three modes, decided by the caller in
// EditorClient. All three flow through the same dialog skeleton (dancer
// picker / startBeat / duration / label) but diverge in their authoring
// surface and how Apply produces events.
//
//   PERSONAL (lockedDancerId set, mode="actions")
//     - dancer is fixed, picker hidden
//     - user authors a list of static / animation actions
//     - Apply → 1 personal event for the locked dancer
//
//   COMMON (lockedDancerId undefined, mode="actions")
//     - user picks N dancers + authors a list of actions
//     - Apply → N personal events (one per dancer; each gets its own
//               deep-cloned copy of the actions)
//
//   EFFECT (mode="effect", lockedDancerId undefined)
//     - user picks N dancers + authors ONE effect config
//     - Apply → 1 timeline event whose single action is type="effect" and
//               action.dancers = the picked dancer ids. The same event
//               appears on every chosen dancer's track in the editor;
//               select / drag / delete acts on the single event so all
//               occurrences move together — that's exactly what the user
//               asked for ("放到timeline上同個effect的人的event要可以同時編輯、移動、刪除").
export type EventModalMode = "actions" | "effect";

interface Props {
  isOpen: boolean;
  dance: DanceProject;
  customAnimations: CustomAnimation[];
  startBeat: number;
  defaultDancerIds: number[];
  lockedDancerId?: number;
  // Defaults to "actions" for backward compat with personal/common callers.
  mode?: EventModalMode;
  onApply: (events: TimelineEvent[]) => void;
  onCancel: () => void;
}

export function EventModal({
  isOpen,
  dance,
  customAnimations,
  startBeat,
  defaultDancerIds,
  lockedDancerId,
  mode = "actions",
  onApply,
  onCancel,
}: Props) {
  const beatUnit = dance.beatUnit > 0 ? dance.beatUnit : 0.5;
  const isPersonal = lockedDancerId !== undefined;
  const isEffectMode = mode === "effect";
  const lockedDancer = isPersonal
    ? dance.dancers.find((d) => d.id === lockedDancerId)
    : undefined;

  const [dancerIds, setDancerIds] = useState<number[]>(
    isPersonal ? [lockedDancerId as number] : defaultDancerIds,
  );
  const [duration, setDuration] = useState<number>(Math.max(beatUnit, 1));
  const [clearBefore, setClearBefore] = useState<boolean>(false);
  const [label, setLabel] = useState<string>("");
  const [actions, setActions] = useState<DanceAction[]>(() => [createEmptyStaticAction()]);
  const [effectAction, setEffectAction] = useState<DanceAction>(() =>
    createEmptyEffectAction("dancer-wave"),
  );
  const [error, setError] = useState<string | null>(null);

  // Reset state on every fresh open so an aborted edit doesn't leak between
  // sessions of the modal.
  useEffect(() => {
    if (!isOpen) return;
    if (isPersonal) {
      setDancerIds([lockedDancerId as number]);
    } else {
      setDancerIds(
        defaultDancerIds.length > 0 ? defaultDancerIds : dance.dancers.map((d) => d.id),
      );
    }
    setDuration(Math.max(beatUnit, 1));
    setClearBefore(false);
    setLabel("");
    setActions([createEmptyStaticAction()]);
    setEffectAction(createEmptyEffectAction("dancer-wave"));
    setError(null);
  }, [isOpen, defaultDancerIds, dance.dancers, beatUnit, isPersonal, lockedDancerId]);

  if (!isOpen) return null;

  const toggleDancer = (id: number) => {
    if (isPersonal) return;
    setDancerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort((a, b) => a - b),
    );
  };

  const addAction = (kind: "static" | "animation") => {
    const fresh = kind === "static" ? createEmptyStaticAction() : createEmptyAnimationAction();
    setActions((prev) => [...prev, fresh]);
  };
  const updateAction = (idx: number, next: DanceAction) =>
    setActions((prev) => prev.map((a, i) => (i === idx ? next : a)));
  const deleteAction = (idx: number) =>
    setActions((prev) => prev.filter((_, i) => i !== idx));

  const setEffectConfig = (next: EffectConfig) =>
    setEffectAction((prev) => ({ ...prev, effect: next }));

  const handleApply = () => {
    if (dancerIds.length === 0) {
      setError("Pick at least one dancer.");
      return;
    }
    if (!isEffectMode && actions.length === 0) {
      setError("Add at least one action.");
      return;
    }
    if (isEffectMode && !effectAction.effect) {
      setError("Configure the effect first.");
      return;
    }
    const dur = Math.max(beatUnit, snapBeat(duration, beatUnit));
    const sb = snapBeat(startBeat, beatUnit);
    const sectionId = findSectionForBeat(dance, sb);
    const existing = dance.timelineEvents ?? [];

    // Overlap guard uses the user-chosen duration so a tighter slot can be
    // hit by shortening the event.
    const conflicts: number[] = [];
    for (const dId of dancerIds) {
      if (hasOverlapForDancer(existing, dId, sb, dur)) conflicts.push(dId);
    }
    if (conflicts.length > 0) {
      setError(
        `Overlap at beat ${sb} (duration ${dur}) for dancer${conflicts.length === 1 ? "" : "s"}: ${conflicts.join(", ")}.`,
      );
      return;
    }

    let generated: TimelineEvent[];
    if (isEffectMode) {
      // ONE event holding ONE effect action that addresses every chosen
      // dancer. Selecting / dragging / deleting it on any of its tracks
      // moves the whole effect because they're all the same row.
      const fxAction: DanceAction = {
        type: "effect",
        dancers: [...dancerIds],
        color: { ...effectAction.color },
        // The picked dancers always become the candidate pool for the effect.
        // The effect's own customOrder / dancerGroups still reference dancer
        // ids, which the user authored in the EffectEditor below.
        effect: effectAction.effect ?? createEmptyEffectConfig("dancer-wave"),
        ...(effectAction.parts && effectAction.parts.length > 0
          ? { parts: [...effectAction.parts] }
          : {}),
      };
      const evt: TimelineEvent = {
        id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        sectionId,
        startBeat: sb,
        durationBeats: dur,
        clearBefore,
        actions: [fxAction],
      };
      if (label.trim().length > 0) evt.label = label.trim();
      generated = [evt];
    } else {
      generated = dancerIds.map((dId, i) => {
        const cloned: DanceAction[] = actions.map((a) => ({
          ...JSON.parse(JSON.stringify(a)),
          dancers: [dId],
        }));
        const evt: TimelineEvent = {
          id: `evt-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          sectionId,
          startBeat: sb,
          durationBeats: dur,
          clearBefore,
          actions: cloned,
          lockedDancerId: dId,
        };
        if (label.trim().length > 0) evt.label = label.trim();
        return evt;
      });
    }
    onApply(generated);
  };

  const headerTitle = isEffectMode
    ? "Add effect event"
    : isPersonal
      ? "Add personal event"
      : "Add common event";
  const headerSubtitle = isEffectMode
    ? `→ one shared effect event across ${dancerIds.length || "?"} dancer${dancerIds.length === 1 ? "" : "s"}`
    : isPersonal
      ? lockedDancer
        ? `for #${lockedDancerId} · ${lockedDancer.name}`
        : `for dancer #${lockedDancerId}`
      : `→ splits into ${dancerIds.length || "?"} personal event${dancerIds.length === 1 ? "" : "s"} on Apply`;
  const applyLabel = isEffectMode
    ? "Create effect event"
    : isPersonal
      ? "Create event"
      : `Apply (${dancerIds.length} event${dancerIds.length === 1 ? "" : "s"})`;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 8,
          width: "min(720px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <strong>{headerTitle}</strong>
          {isPersonal && (
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                background: "#e0e7ff",
                border: "1px solid #6366f1",
                color: "#3730a3",
              }}
            >
              🔒 #{lockedDancerId}
              {lockedDancer ? ` · ${lockedDancer.name}` : ""}
            </span>
          )}
          <span className="muted" style={{ fontSize: 12 }}>
            {headerSubtitle}
          </span>
          <span className="spacer" />
          <button onClick={onCancel}>✕</button>
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {!isPersonal && (
            <div>
              <span className="group-label">Dancers</span>
              <div className="row" style={{ flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {dance.dancers.map((d) => {
                  const on = dancerIds.includes(d.id);
                  return (
                    <span
                      key={d.id}
                      className={`chip${on ? " on" : ""}`}
                      onClick={() => toggleDancer(d.id)}
                      role="checkbox"
                      aria-checked={on}
                    >
                      {d.id}. {d.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <label className="row" style={{ gap: 4 }}>
              <span className="group-label">startBeat</span>
              <span
                style={{
                  fontFamily: "monospace",
                  background: "#f1f5f9",
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 12,
                }}
                title="Set by the timeline playhead before opening the modal"
              >
                {startBeat}
              </span>
            </label>
            <label className="row" style={{ gap: 4 }}>
              <span className="group-label">durationBeats</span>
              <input
                type="number"
                min={beatUnit}
                step={beatUnit}
                value={duration}
                onChange={(e) =>
                  setDuration(Math.max(beatUnit, snapBeat(Number(e.target.value), beatUnit)))
                }
                style={{ width: 90 }}
              />
            </label>
            <label className="row" style={{ gap: 4 }}>
              <input
                type="checkbox"
                checked={clearBefore}
                onChange={(e) => setClearBefore(e.target.checked)}
              />
              <span className="group-label">clearBefore</span>
            </label>
            <label className="row" style={{ gap: 4, flex: 1, minWidth: 200 }}>
              <span className="group-label">label</span>
              <input
                value={label}
                placeholder={
                  isEffectMode
                    ? "(shown on the timeline block — appears on every dancer's row)"
                    : isPersonal
                      ? "(shown on the timeline block)"
                      : "(applied to every generated event)"
                }
                onChange={(e) => setLabel(e.target.value)}
                style={{ flex: 1 }}
              />
            </label>
          </div>

          {isEffectMode ? (
            <div className="col" style={{ gap: 8 }}>
              <span className="group-label">Effect (one shared event for all picked dancers)</span>
              <EffectEditor
                effect={effectAction.effect ?? createEmptyEffectConfig("dancer-wave")}
                dancers={dance.dancers}
                onChange={setEffectConfig}
              />
              <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                <span className="muted" style={{ fontSize: 11 }}>
                  Body parts + color come from the action card; for effect mode they
                  default to body / yellow. Edit them in the action card after Apply
                  if you want something else.
                </span>
              </div>
            </div>
          ) : (
            <div className="col" style={{ gap: 6 }}>
              <span className="group-label">
                {isPersonal
                  ? "Actions"
                  : "Actions (each selected dancer gets their own copy)"}
              </span>
              {actions.map((a, i) => (
                <ActionEditor
                  key={i}
                  action={a}
                  dancers={dance.dancers}
                  customAnimations={customAnimations}
                  onChange={(next) => updateAction(i, next)}
                  onDelete={() => deleteAction(i)}
                  hideDancers
                />
              ))}
              <div className="row" style={{ gap: 6 }}>
                <button onClick={() => addAction("static")}>+ static action</button>
                <button onClick={() => addAction("animation")}>+ animation action</button>
              </div>
            </div>
          )}

          {error && <div className="error" style={{ padding: 8 }}>{error}</div>}
        </div>

        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
          }}
        >
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            onClick={handleApply}
            disabled={
              dancerIds.length === 0 ||
              (isEffectMode ? !effectAction.effect : actions.length === 0)
            }
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
