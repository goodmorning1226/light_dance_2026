"use client";

import { useEffect, useState } from "react";
import type {
  CustomAnimation,
  DanceAction,
  DanceProject,
  TimelineEvent,
} from "@/types";
import { ActionEditor } from "./ActionEditor";
import { createEmptyAnimationAction, createEmptyStaticAction } from "@/lib/editor/factories";
import {
  findSectionForBeat,
  hasOverlapForDancer,
  snapBeat,
} from "@/lib/editor/timelineHelpers";

interface Props {
  isOpen: boolean;
  dance: DanceProject;
  customAnimations: CustomAnimation[];
  // Beat at which the new event(s) will start. Frozen at modal-open time so
  // the picker is stable; the user can drag the playhead afterwards without
  // the modal jumping.
  startBeat: number;
  // Dancers pre-selected when the modal opens — typically the dancers
  // visible in the current ViewMode, falling back to all of them. In personal
  // mode this is forced to `[lockedDancerId]` regardless.
  defaultDancerIds: number[];
  // When set, the modal runs in PERSONAL mode: dancer is fixed, the picker
  // chips are hidden, and Apply produces exactly one personal event for this
  // dancer. When undefined, the modal runs in COMMON mode: user picks
  // multiple dancers and Apply fans out into one personal event per chosen
  // dancer.
  lockedDancerId?: number;
  onApply: (events: TimelineEvent[]) => void;
  onCancel: () => void;
}

// Unified entry point for new events. Whether the user kicked off via the
// per-dancer "+ Event" button (PERSONAL mode) or the top "+ Common Event"
// button (COMMON mode), the dialog body is the same: pick duration / clear /
// label and author the action list, then on Apply we produce one personal
// event per included dancer (`lockedDancerId` set, action.dancers locked to
// that one id). After Apply the data layer has no "common event" entity.
export function EventModal({
  isOpen,
  dance,
  customAnimations,
  startBeat,
  defaultDancerIds,
  lockedDancerId,
  onApply,
  onCancel,
}: Props) {
  const beatUnit = dance.beatUnit > 0 ? dance.beatUnit : 0.5;
  const isPersonal = lockedDancerId !== undefined;
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
  const [error, setError] = useState<string | null>(null);

  // Reset state on every fresh open so an aborted edit doesn't leak.
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

  const handleApply = () => {
    if (dancerIds.length === 0) {
      setError("Pick at least one dancer.");
      return;
    }
    if (actions.length === 0) {
      setError("Add at least one action.");
      return;
    }
    const dur = Math.max(beatUnit, snapBeat(duration, beatUnit));
    const sb = snapBeat(startBeat, beatUnit);
    const sectionId = findSectionForBeat(dance, sb);
    const existing = dance.timelineEvents ?? [];

    // Overlap guard uses the user-chosen duration (not a default), so making
    // the event shorter to fit a tight gap is supported.
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

    const generated: TimelineEvent[] = dancerIds.map((dId, i) => {
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
    onApply(generated);
  };

  const headerTitle = isPersonal ? "Add personal event" : "Add common event";
  const headerSubtitle = isPersonal
    ? lockedDancer
      ? `for #${lockedDancerId} · ${lockedDancer.name}`
      : `for dancer #${lockedDancerId}`
    : `→ splits into ${dancerIds.length || "?"} personal event${dancerIds.length === 1 ? "" : "s"} on Apply`;
  const applyLabel = isPersonal
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
                  isPersonal
                    ? "(shown on the timeline block)"
                    : "(applied to every generated event)"
                }
                onChange={(e) => setLabel(e.target.value)}
                style={{ flex: 1 }}
              />
            </label>
          </div>

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
            disabled={dancerIds.length === 0 || actions.length === 0}
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
