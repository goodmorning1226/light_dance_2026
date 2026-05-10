"use client";

import { useCloud } from "./CloudModeProvider";

interface MembersPanelProps {
  open: boolean;
  onClose: () => void;
}

// Side-panel summary of who's currently in the program. Combines two
// sources: the durable membership list (from `program_members` rows pulled
// when the program loads) and the live presence map (who's actually got
// the editor open *right now*). A presence entry without a matching member
// row is unusual but possible during the brief window before a join RPC's
// row is reflected in the snapshot — we render those too, marked as such.
export function MembersPanel({ open, onClose }: MembersPanelProps) {
  const { state, presences, editing } = useCloud();
  if (!open || !state) return null;

  const members = state.members;
  const onlineUserIds = new Set(Object.keys(presences));

  return (
    <div
      role="dialog"
      aria-label="Program members"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100vh",
        width: 320,
        background: "white",
        borderLeft: "1px solid #e2e8f0",
        boxShadow: "-2px 0 12px rgba(0,0,0,0.08)",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <strong>Members ({members.length})</strong>
        <button onClick={onClose}>Close</button>
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: "8px 0",
          overflowY: "auto",
          flex: 1,
        }}
      >
        {members.map((m) => {
          const online = onlineUserIds.has(m.userId);
          const presence = presences[m.userId];
          const ed = editing[m.userId];
          return (
            <li
              key={m.userId}
              style={{
                padding: "8px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: online ? "#16a34a" : "#cbd5e1",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontWeight: 600 }}>{m.displayName}</span>
                <span
                  className="muted"
                  style={{ fontSize: 11, marginLeft: "auto" }}
                >
                  {m.role}
                </span>
              </div>
              {online && presence?.currentView && (
                <div className="muted" style={{ fontSize: 11, marginLeft: 16 }}>
                  on {presence.currentView}
                  {presence.currentDanceId ? ` · dance ${presence.currentDanceId}` : ""}
                </div>
              )}
              {ed?.editing && (
                <div style={{ fontSize: 11, marginLeft: 16, color: "#b45309" }}>
                  editing {ed.eventId ? `event ${ed.eventId}` : ed.sectionId ? `section ${ed.sectionId}` : "…"}
                </div>
              )}
            </li>
          );
        })}

        {/* Presences without a matching member row (rare race) */}
        {Object.values(presences)
          .filter((p) => !members.some((m) => m.userId === p.userId))
          .map((p) => (
            <li
              key={`ghost-${p.userId}`}
              style={{
                padding: "8px 14px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderBottom: "1px solid #f1f5f9",
                opacity: 0.7,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#16a34a",
                  flexShrink: 0,
                }}
              />
              <span>{p.displayName}</span>
              <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>
                joining…
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
