"use client";

import type { CollaborationStatus } from "@/types";

interface Props {
  status: CollaborationStatus;
  lastSyncedAt: Date | null;
  errorMessage?: string | null;
}

const COLOR: Record<CollaborationStatus, string> = {
  local: "#94a3b8",
  connecting: "#fbbf24",
  connected: "#10b981",
  saving: "#3b82f6",
  saved: "#10b981",
  error: "#dc2626",
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
  const dot = COLOR[status];
  const label = LABEL[status];
  const tooltip = errorMessage
    ? `Error: ${errorMessage}`
    : lastSyncedAt
      ? `Last synced ${lastSyncedAt.toLocaleTimeString()}`
      : "";
  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        padding: "2px 8px",
        borderRadius: 999,
        background: status === "error" ? "#fef2f2" : "#f1f5f9",
        color: status === "error" ? "#991b1b" : "#1e293b",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dot,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}
