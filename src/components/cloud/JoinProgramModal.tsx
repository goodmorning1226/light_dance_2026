"use client";

import { useState } from "react";
import { useCloud } from "./CloudModeProvider";
import { ModalShell } from "./CreateProgramModal";
import { getStoredDisplayName } from "@/lib/supabase/auth";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function JoinProgramModal({ open, onClose }: Props) {
  const { joinProgram } = useCloud();
  const [shareCode, setShareCode] = useState("");
  const [displayName, setDisplayName] = useState(getStoredDisplayName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await joinProgram(shareCode, displayName);
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setShareCode("");
    setError(null);
    onClose();
  };

  return (
    <ModalShell title="Join cloud program" onClose={handleClose}>
      <div className="col" style={{ gap: 10 }}>
        <label className="col" style={{ gap: 4 }}>
          <span className="group-label">Share code</span>
          <input
            value={shareCode}
            onChange={(e) => setShareCode(e.target.value.toUpperCase())}
            placeholder="ABCD1234"
            style={{
              fontFamily: "monospace",
              fontSize: 18,
              letterSpacing: 4,
              textAlign: "center",
            }}
            autoFocus
            maxLength={8}
          />
          <span className="muted" style={{ fontSize: 11 }}>
            Ask the program owner for this 8-character code.
          </span>
        </label>
        <label className="col" style={{ gap: 4 }}>
          <span className="group-label">Your display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Sigma"
          />
        </label>

        {error && <div className="error">{error}</div>}

        <div className="row" style={{ gap: 6 }}>
          <span className="spacer" />
          <button onClick={handleClose} disabled={submitting}>Cancel</button>
          <button
            className="primary"
            onClick={handleSubmit}
            disabled={submitting || !shareCode.trim() || !displayName.trim()}
          >
            {submitting ? "Joining…" : "Join"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
