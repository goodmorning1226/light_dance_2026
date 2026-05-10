"use client";

import type {
  CustomAnimation,
  DanceAction,
  DanceProject,
  DanceSection,
  TimelineEvent,
} from "@/types";
import { ActionEditor } from "./ActionEditor";
import { snapBeat } from "@/lib/editor/timelineHelpers";
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

  const updateAction = (idx: number, next: DanceAction) =>
    onChange({ ...event, actions: event.actions.map((a, i) => (i === idx ? next : a)) });

  const deleteAction = (idx: number) =>
    onChange({ ...event, actions: event.actions.filter((_, i) => i !== idx) });

  const addAction = (kind: "static" | "animation") => {
    const fresh = kind === "static" ? createEmptyStaticAction() : createEmptyAnimationAction();
    onChange({ ...event, actions: [...event.actions, fresh] });
  };

  return (
    <div className="card" style={{ borderLeft: "4px solid #1f6feb" }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <strong>Event</strong>
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
            onChange={(e) => onChange({ ...event, startBeat: snapBeat(Number(e.target.value), beatUnit) })}
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
      </div>

      <div className="row" style={{ gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <label className="row" style={{ gap: 4 }}>
          <span className="group-label">section</span>
          <select
            value={event.sectionId}
            onChange={(e) => onChange({ ...event, sectionId: e.target.value })}
          >
            {dance.sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="row" style={{ gap: 4, flex: 1 }}>
          <span className="group-label">label</span>
          <input
            value={event.label ?? ""}
            placeholder="(optional, displayed on the timeline tooltip)"
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

export function buildEmptyEvent(
  dance: DanceProject,
  defaults: { sectionId?: string; startBeat?: number; dancerId?: number },
): TimelineEvent {
  const beatUnit = dance.beatUnit > 0 ? dance.beatUnit : 0.5;
  const fallbackSection: DanceSection | undefined = dance.sections[dance.sections.length - 1] ?? dance.sections[0];
  const sectionId = defaults.sectionId ?? fallbackSection?.id ?? "section-default";
  const startBeat = snapBeat(defaults.startBeat ?? 0, beatUnit);

  const action = createEmptyStaticAction();
  if (defaults.dancerId !== undefined) action.dancers = [defaults.dancerId];

  return {
    id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    sectionId,
    startBeat,
    durationBeats: Math.max(beatUnit, 1),
    clearBefore: false,
    actions: [action],
  };
}
