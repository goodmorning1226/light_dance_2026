"use client";

import type { CollaborationStatus } from "@/types";

interface Props {
  status: CollaborationStatus;
  lastSyncedAt: Date | null;
  errorMessage?: string | null;
}

interface StatusStyle {
  dot: string;
  bg: string;
  fg: string;
  border: string;
  pulse: boolean;
}

const STATUS: Record<CollaborationStatus, StatusStyle> = {
  local:      { dot: "#94a3b8", bg: "#f1f5f9", fg: "#475569", border: "#e2e8f0", pulse: false },
  connecting: { dot: "#f59e0b", bg: "#fffbeb", fg: "#92400e", border: "#fde68a", pulse: true },
  connected:  { dot: "#10b981", bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0", pulse: false },
  saving:     { dot: "#4f46e5", bg: "#eef2ff", fg: "#3730a3", border: "#c7d2fe", pulse: true },
  saved:      { dot: "#10b981", bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0", pulse: false },
  error:      { dot: "#dc2626", bg: "#fef2f2", fg: "#991b1b", border: "#fecaca", pulse: false },
};

const LABEL: Record<CollaborationStatus, string> = {
  local: "Local only",
  connecting: "Connecting…",
  connected: "Cloud connected",
  saving: "Saving…",
  saved: "Saved",
  error: "Error",
};

export function SyncStatusBadge({ status, lastSyncedAt, errorMessage }: Props) {
  const s = STATUS[status];
  const tooltip = errorMessage
    ? `Error: ${errorMessage}`
    : lastSyncedAt
      ? `Last synced ${lastSyncedAt.toLocaleTimeString()}`
      : "";
  return (
    <>
      <style>{`
        @keyframes ld26-status-pulse {
          0%, 100% { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
          50%      { box-shadow: 0 0 0 4px transparent; opacity: 0.55; }
        }
      `}</style>
      <span
        title={tooltip}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          padding: "3px 10px",
          borderRadius: 999,
          background: s.bg,
          color: s.fg,
          border: `1px solid ${s.border}`,
          letterSpacing: 0.1,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: s.dot,
            display: "inline-block",
            color: s.dot,
            animation: s.pulse ? "ld26-status-pulse 1.4s ease-in-out infinite" : undefined,
          }}
        />
        {LABEL[status]}
      </span>
    </>
  );
}
