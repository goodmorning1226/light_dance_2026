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
          padding: "6px 16px",
          background: "white",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          gap: 10,
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
            <span style={{ fontWeight: 600 }}>{state.program.name}</span>
            <button
              onClick={() => setMembersOpen(true)}
              title="Show members panel"
              style={{
                padding: "1px 6px",
                fontSize: 11,
                borderRadius: 999,
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                cursor: "pointer",
              }}
            >
              {state.members.length} member{state.members.length === 1 ? "" : "s"}
              {onlineCount > 0 ? ` · ${onlineCount} online` : ""}
            </button>
            <span className="muted">· {state.myDisplayName} ({state.myRole})</span>

            <span style={{ flex: 1 }} />

            <span className="muted">share code</span>
            <code
              onClick={handleCopyShareCode}
              title="Click to copy"
              style={{
                fontFamily: "monospace",
                fontWeight: 700,
                letterSpacing: 2,
                padding: "2px 8px",
                background: "#f1f5f9",
                borderRadius: 4,
                cursor: "pointer",
                userSelect: "all",
              }}
            >
              {state.program.shareCode}
            </code>
            {copied && <span className="muted">copied</span>}

            <button onClick={pushLocalToCloud} title="Push every local dance to the cloud now">
              Push local
            </button>
            <button onClick={reloadProgram} title="Pull the latest from the cloud">
              Reload
            </button>
            <button className="danger ghost" onClick={leaveProgram}>
              Leave
            </button>
          </>
        ) : (
          <>
            <span className="muted">
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
              <span className="muted" style={{ fontSize: 11 }}>
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
