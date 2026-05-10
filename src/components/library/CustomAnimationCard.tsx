"use client";

import { useState } from "react";
import type { CustomAnimation } from "@/types";
import { detectMqttReferences } from "@/lib/codegen";

interface Props {
  animation: CustomAnimation;
  onExport: () => void;
  onDelete: () => void;
}

export function CustomAnimationCard({ animation, onExport, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasMqtt = detectMqttReferences(animation.cppCode);

  return (
    <div className="card" style={{ borderLeft: "4px solid #1f6feb" }}>
      <div className="row" style={{ marginBottom: 6 }}>
        <strong style={{ fontSize: 16 }}>{animation.name}</strong>
        <span className="muted" style={{ fontFamily: "monospace", fontSize: 11 }}>
          v{animation.schemaVersion}
        </span>
        <span className="spacer" />
        <button onClick={onExport}>Export JSON</button>
        <button className="danger" onClick={onDelete}>Delete</button>
      </div>

      <div className="muted" style={{ marginBottom: 6 }}>{animation.description || "(no description)"}</div>

      <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <Pair label="id" value={animation.id} mono />
        <Pair label="functionName" value={animation.functionName} mono />
      </div>

      {animation.parameters.length > 0 && (
        <div className="col" style={{ gap: 2, marginBottom: 6 }}>
          <span className="group-label">parameters</span>
          {animation.parameters.map((p, i) => (
            <span key={i} className="muted" style={{ fontFamily: "monospace", fontSize: 12 }}>
              {p.required ? "" : "?"}{p.name}: {p.type}{p.description ? `  // ${p.description}` : ""}
            </span>
          ))}
        </div>
      )}

      {hasMqtt && (
        <div
          className="error"
          style={{ marginBottom: 6, fontSize: 12 }}
        >
          ⚠️ cppCode references <code>client.*</code> / <code>setup_wifi</code> / <code>reconnect</code>.
          Offline export will inject a warning comment; the call may fail at runtime in offline mode.
        </div>
      )}

      <div className="row" style={{ marginBottom: 4 }}>
        <span className="group-label">cppCode</span>
        <span className="spacer" />
        <button className="ghost" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      <pre
        style={{
          maxHeight: expanded ? "none" : 120,
          overflow: "auto",
          fontSize: 11,
        }}
      >
        {animation.cppCode}
      </pre>
    </div>
  );
}

function Pair({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="row" style={{ gap: 4 }}>
      <span className="group-label">{label}</span>
      <span style={{ fontFamily: mono ? "monospace" : undefined, fontSize: 12 }}>{value}</span>
    </div>
  );
}
