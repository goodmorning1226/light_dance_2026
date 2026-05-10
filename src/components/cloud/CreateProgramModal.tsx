"use client";

import { useState } from "react";
import { useCloud } from "./CloudModeProvider";
import { getStoredDisplayName } from "@/lib/supabase/auth";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateProgramModal({ open, onClose }: Props) {
  const { createProgram } = useCloud();
  const [programName, setProgramName] = useState("");
  const [displayName, setDisplayName] = useState(getStoredDisplayName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdShareCode, setCreatedShareCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const { shareCode } = await createProgram(programName, displayName);
      setCreatedShareCode(shareCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!createdShareCode) return;
    try {
      await navigator.clipboard.writeText(createdShareCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleClose = () => {
    setProgramName("");
    setError(null);
    setCreatedShareCode(null);
    setCopied(false);
    onClose();
  };

  return (
    <ModalShell title="Create cloud program" onClose={handleClose}>
      {createdShareCode ? (
        <div className="col" style={{ gap: 12 }}>
          <p style={{ margin: 0 }}>
            Cloud program <strong>{programName}</strong> is live. Share this
            code with collaborators — they enter it in the Join dialog.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <code
              style={{
                fontSize: 24,
                letterSpacing: 4,
                padding: "10px 16px",
                background: "#f1f5f9",
                borderRadius: 6,
                fontWeight: 700,
                flex: 1,
                textAlign: "center",
              }}
            >
              {createdShareCode}
            </code>
            <button className="primary" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="row">
            <span className="spacer" />
            <button className="primary" onClick={handleClose}>Done</button>
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          <label className="col" style={{ gap: 4 }}>
            <span className="group-label">Program name</span>
            <input
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
              placeholder="e.g. 2026 Spring Show"
              autoFocus
            />
          </label>
          <label className="col" style={{ gap: 4 }}>
            <span className="group-label">Your display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Sigma"
            />
            <span className="muted" style={{ fontSize: 11 }}>
              Used by other collaborators to see who's editing.
            </span>
          </label>

          {error && <div className="error">{error}</div>}

          <div className="row" style={{ gap: 6 }}>
            <span className="spacer" />
            <button onClick={handleClose} disabled={submitting}>Cancel</button>
            <button
              className="primary"
              onClick={handleSubmit}
              disabled={submitting || !programName.trim() || !displayName.trim()}
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

export function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.5)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          width: "min(480px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          padding: 16,
        }}
      >
        <div className="row" style={{ marginBottom: 12 }}>
          <strong>{title}</strong>
          <span className="spacer" />
          <button className="ghost" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
