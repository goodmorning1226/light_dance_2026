"use client";

import type {
  CustomAnimation,
  DanceAction,
  DanceProject,
  TimelineEvent,
} from "@/types";
import { ActionEditor } from "./ActionEditor";
import { findSectionForBeat, snapBeat } from "@/lib/editor/timelineHelpers";
import { createEmptyAnimationAction, createEmptyStaticAction } from "@/lib/editor/factories";

interface Props {
  event: TimelineEvent;
  dance: DanceProject;
  customAnimations: CustomAnimation[];
  onChange: (next: TimelineEvent) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function TimelineEventEditor({
  event,
  dance,
  customAnimations,
  onChange,
  onDelete,
  onDuplicate,
}: Props) {
  const beatUnit = dance.beatUnit > 0 ? dance.beatUnit : 0.5;
  const isPersonal = event.lockedDancerId !== undefined;
  const lockedDancer = isPersonal
    ? dance.dancers.find((d) => d.id === event.lockedDancerId)
    : undefined;

  // For personal events, force every action's dancers list to exactly the
  // locked dancer ID so the data and the locked-UI never disagree (e.g.
  // legacy JSON imports with extra dancers).
  const updateAction = (idx: number, next: DanceAction) => {
    const fixed: DanceAction = isPersonal
      ? { ...next, dancers: [event.lockedDancerId as number] }
      : next;
    onChange({ ...event, actions: event.actions.map((a, i) => (i === idx ? fixed : a)) });
  };

  const deleteAction = (idx: number) =>
    onChange({ ...event, actions: event.actions.filter((_, i) => i !== idx) });

  const addAction = (kind: "static" | "animation") => {
    const fresh = kind === "static" ? createEmptyStaticAction() : createEmptyAnimationAction();
    if (isPersonal) fresh.dancers = [event.lockedDancerId as number];
    onChange({ ...event, actions: [...event.actions, fresh] });
  };

  // When startBeat changes, also re-infer sectionId so codegen groups the
  // event into whatever section visually contains the new position. The user
  // never has to think about sectionId; sections are just markers on the
  // ruler.
  const setStartBeat = (raw: number) => {
    const snapped = snapBeat(raw, beatUnit);
    onChange({
      ...event,
      startBeat: snapped,
      sectionId: findSectionForBeat(dance, snapped),
    });
  };

  return (
    <div
      className="card"
      style={{ borderLeft: `4px solid ${isPersonal ? "#6366f1" : "#1f6feb"}` }}
    >
      <div className="row" style={{ marginBottom: 8 }}>
        <strong>{isPersonal ? "Personal Event" : "Event"}</strong>
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
            🔒 #{event.lockedDancerId}
            {lockedDancer ? ` · ${lockedDancer.name}` : ""}
          </span>
        )}
        <span className="muted" style={{ fontFamily: "monospace", fontSize: 11 }}>{event.id}</span>
        <span className="spacer" />
        <button onClick={onDuplicate} title="Duplicate">⧉</button>
        <button className="danger" onClick={onDelete} title="Delete">✕</button>
      </div>

      <div className="row" style={{ gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <label className="row" style={{ gap: 4 }}>
          <span className="group-label">startBeat</span>
          <input
            type="number"
            min={0}
            step={beatUnit}
            value={event.startBeat}
            onChange={(e) => setStartBeat(Number(e.target.value))}
            style={{ width: 90 }}
          />
        </label>
        <label className="row" style={{ gap: 4 }}>
          <span className="group-label">durationBeats</span>
          <input
            type="number"
            min={beatUnit}
            step={beatUnit}
            value={event.durationBeats}
            onChange={(e) =>
              onChange({
                ...event,
                durationBeats: Math.max(beatUnit, snapBeat(Number(e.target.value), beatUnit)),
              })
            }
            style={{ width: 90 }}
          />
        </label>
        <label className="row" style={{ gap: 4 }}>
          <input
            type="checkbox"
            checked={event.clearBefore}
            onChange={(e) => onChange({ ...event, clearBefore: e.target.checked })}
          />
          <span className="group-label">clearBefore</span>
        </label>
        <label className="row" style={{ gap: 4, flex: 1, minWidth: 200 }}>
          <span className="group-label">label</span>
          <input
            value={event.label ?? ""}
            placeholder="(shown on the timeline block)"
            onChange={(e) => {
              const next: TimelineEvent = { ...event };
              const v = e.target.value;
              if (v) next.label = v;
              else delete next.label;
              onChange(next);
            }}
            style={{ flex: 1 }}
          />
        </label>
      </div>

      <div className="col" style={{ gap: 6 }}>
        {event.actions.map((action, i) => (
          <ActionEditor
            key={i}
            action={action}
            dancers={dance.dancers}
            customAnimations={customAnimations}
            onChange={(next) => updateAction(i, next)}
            onDelete={() => deleteAction(i)}
            {...(isPersonal ? { hideDancers: true } : {})}
          />
        ))}
        <div className="row" style={{ gap: 6 }}>
          <button onClick={() => addAction("static")}>+ static action</button>
          <button onClick={() => addAction("animation")}>+ animation action</button>
        </div>
      </div>
    </div>
  );
}

