"use client";

import type { ProgramItem } from "@/types";

interface Props {
  item: ProgramItem;
  index: number;
  total: number;
  onEdit: () => void;
  onUpdateMqtt: (cmd: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onExportDanceJson: () => void;
}

export function ProgramItemRow({
  item,
  index,
  total,
  onEdit,
  onUpdateMqtt,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onExportDanceJson,
}: Props) {
  const dance = item.dance;
  const orphaned = !dance;

  return (
    <div
      className="card"
      style={{
        borderLeft: `4px solid ${orphaned ? "#dc2626" : "#1f6feb"}`,
        opacity: orphaned ? 0.85 : 1,
      }}
    >
      <div className="row" style={{ marginBottom: 8 }}>
        <span
          className="muted"
          style={{ fontFamily: "monospace", fontSize: 11, width: 28 }}
        >
          #{index + 1}
        </span>
        <strong style={{ fontSize: 16 }}>{dance?.name ?? "(deleted dance)"}</strong>
        {orphaned && (
          <span
            className="error"
            style={{ padding: "2px 6px", fontSize: 11 }}
          >
            orphaned · danceId: {item.danceId}
          </span>
        )}
        {dance && <span className="muted">BPM {dance.bpm}</span>}
        <span className="spacer" />
        <span className="muted" style={{ fontFamily: "monospace", fontSize: 11 }}>
          {item.id}
        </span>
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <span className="group-label" style={{ width: 50 }}>MQTT</span>
        <input
          value={item.mqttCommand}
          onChange={(e) => onUpdateMqtt(e.target.value)}
          style={{ flex: 1, fontFamily: "monospace" }}
          placeholder="ON_OPENING"
        />
      </div>

      <div className="row" style={{ gap: 6 }}>
        <button onClick={onEdit} disabled={orphaned} title="Edit dance in Editor">
          Edit
        </button>
        <button onClick={onExportDanceJson} disabled={orphaned}>
          Export Dance JSON
        </button>
        <button onClick={onDuplicate}>⧉ Duplicate</button>
        <button onClick={onMoveUp} disabled={index === 0} title="Move up">
          ↑
        </button>
        <button onClick={onMoveDown} disabled={index === total - 1} title="Move down">
          ↓
        </button>
        <span className="spacer" />
        <button className="danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
