"use client";

import { useState } from "react";
import { useCloud } from "./CloudModeProvider";
import { CreateProgramModal } from "./CreateProgramModal";
import { JoinProgramModal } from "./JoinProgramModal";
import { MembersPanel } from "./MembersPanel";
import { SyncStatusBadge } from "./SyncStatusBadge";

// The thin bar that lives between the dark NavBar and the page content.
// In Local Mode it offers the entry points to Cloud Mode; once the user is
// inside a program it switches to a status panel with the share code,
// member list, and the leave button.
export function CloudModeBar() {
  const {
    cloudConfigured,
    state,
    status,
    errorMessage,
    lastSyncedAt,
    leaveProgram,
    pushLocalToCloud,
    reloadProgram,
    presences,
  } = useCloud();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const onlineCount = Object.keys(presences).length;

  const handleCopyShareCode = async () => {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(state.program.shareCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  // Don't render the bar at all if Cloud Mode isn't configured AND the user
  // is purely local — saves vertical space and avoids confusion.
  if (!cloudConfigured && !state) {
    return null;
  }

  return (
    <>
      <div
        style={{
          padding: "8px 20px",
          background: "rgba(255,255,255,0.78)",
          backdropFilter: "saturate(180%) blur(10px)",
          WebkitBackdropFilter: "saturate(180%) blur(10px)",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          fontSize: 12,
        }}
      >
        <SyncStatusBadge
          status={status}
          lastSyncedAt={lastSyncedAt}
          errorMessage={errorMessage}
        />

        {state ? (
          <>
            <span
              style={{
                fontWeight: 600,
                fontSize: 13,
                color: "var(--color-text)",
              }}
            >
              {state.program.name}
            </span>

            <button
              onClick={() => setMembersOpen(true)}
              title="Show members panel"
              className="ghost"
              style={{
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 500,
                borderRadius: 999,
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
                gap: 6,
              }}
            >
              <span aria-hidden style={{ fontSize: 10 }}>👥</span>
              {state.members.length} member{state.members.length === 1 ? "" : "s"}
              {onlineCount > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    paddingLeft: 6,
                    marginLeft: 2,
                    borderLeft: "1px solid var(--color-border-strong)",
                    color: "var(--color-success)",
                    fontWeight: 600,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--color-success)",
                      boxShadow: "0 0 0 2px rgba(16,185,129,0.2)",
                    }}
                  />
                  {onlineCount} online
                </span>
              )}
            </button>

            <span
              style={{
                color: "var(--color-text-muted)",
                fontSize: 12,
              }}
            >
              <span style={{ fontWeight: 500, color: "var(--color-text)" }}>
                {state.myDisplayName}
              </span>
              <span
                style={{
                  marginLeft: 6,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: "var(--color-brand-soft)",
                  color: "var(--color-brand-active)",
                  fontWeight: 600,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {state.myRole}
              </span>
            </span>

            <span style={{ flex: 1 }} />

            <span
              style={{
                color: "var(--color-text-muted)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                fontWeight: 600,
              }}
            >
              share code
            </span>
            <code
              onClick={handleCopyShareCode}
              title="Click to copy"
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: 2,
                padding: "4px 12px",
                background: "linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)",
                border: "1px solid var(--color-brand-soft-border)",
                color: "var(--color-brand-active)",
                borderRadius: 8,
                cursor: "pointer",
                userSelect: "all",
                transition: "transform var(--transition-fast), box-shadow var(--transition-fast)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
            >
              {state.program.shareCode}
              <span aria-hidden style={{ fontSize: 11, opacity: 0.7 }}>
                {copied ? "✓" : "⧉"}
              </span>
            </code>
            {copied && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-success)",
                  fontWeight: 600,
                }}
              >
                copied
              </span>
            )}

            <button onClick={pushLocalToCloud} title="Push every local dance to the cloud now">
              ↥ Push local
            </button>
            <button onClick={reloadProgram} title="Pull the latest from the cloud">
              ↻ Reload
            </button>
            <button className="danger ghost" onClick={leaveProgram}>
              Leave
            </button>
          </>
        ) : (
          <>
            <span style={{ color: "var(--color-text-muted)" }}>
              Local Mode — your edits stay in this browser only.
            </span>
            <span style={{ flex: 1 }} />
            {cloudConfigured ? (
              <>
                <button onClick={() => setJoinOpen(true)}>加入共編排舞</button>
                <button className="primary" onClick={() => setCreateOpen(true)}>
                  建立雲端共編
                </button>
              </>
            ) : (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-text-faint)",
                }}
              >
                (Cloud not configured — set NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY to enable)
              </span>
            )}
          </>
        )}
      </div>

      <CreateProgramModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinProgramModal open={joinOpen} onClose={() => setJoinOpen(false)} />
      <MembersPanel open={membersOpen} onClose={() => setMembersOpen(false)} />
    </>
  );
}
