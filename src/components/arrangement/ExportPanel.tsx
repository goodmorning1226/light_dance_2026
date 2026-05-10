"use client";

import { useEffect, useMemo, useState } from "react";
import type { ExportSettings, ExportType, ProgramArrangement } from "@/types";
import { generateFullIno } from "@/lib/codegen";

interface Props {
  program: ProgramArrangement;
  settings: ExportSettings;
}

const FILENAME: Record<ExportType, string> = {
  snippet: "generated_dance_snippet.cpp",
  "full-offline-ino": "light_dance_2026_offline_generated.ino",
  "full-online-mqtt-ino": "light_dance_2026_online_generated.ino",
};

const NEEDS_BASE: Record<ExportType, boolean> = {
  snippet: false,
  "full-offline-ino": true,
  "full-online-mqtt-ino": true,
};

interface BaseIno {
  source: "auto" | "uploaded";
  content: string;
  filename?: string;
}

export function ExportPanel({ program, settings }: Props) {
  const [baseIno, setBaseIno] = useState<BaseIno | null>(null);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/base-ino")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        setBaseIno({ source: "auto", content: text });
        setBaseError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setBaseError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo(() => {
    try {
      if (NEEDS_BASE[settings.exportType] && !baseIno) {
        return {
          ok: false as const,
          error: "No base .ino loaded. Upload light_dance_2026.ino below.",
        };
      }
      return {
        ok: true as const,
        value: generateFullIno(program, settings, baseIno?.content),
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [program, settings, baseIno]);

  const handleCopy = async () => {
    if (!result.ok) return;
    try {
      await navigator.clipboard.writeText(result.value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  const handleDownload = () => {
    if (!result.ok) return;
    const blob = new Blob([result.value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = FILENAME[settings.exportType];
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadBase = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ino,.cpp,.txt,text/plain";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      setBaseIno({ source: "uploaded", content: text, filename: file.name });
      setBaseError(null);
    };
    input.click();
  };

  const handleResetBase = () => {
    setBaseIno(null);
    setBaseError(null);
    fetch("/api/base-ino")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => setBaseIno({ source: "auto", content: text }))
      .catch((e) => setBaseError(e instanceof Error ? e.message : String(e)));
  };

  const copyLabel =
    copyState === "copied" ? "Copied!" : copyState === "failed" ? "Copy failed" : "Copy code";

  return (
    <div className="col" style={{ gap: 8, height: "100%" }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button className="primary" onClick={handleCopy} disabled={!result.ok}>
          {copyLabel}
        </button>
        <button onClick={handleDownload} disabled={!result.ok}>
          Download {FILENAME[settings.exportType].split(".").pop()}
        </button>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 11 }}>
          {FILENAME[settings.exportType]}
        </span>
      </div>

      {NEEDS_BASE[settings.exportType] && (
        <div className="card" style={{ padding: 8, fontSize: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="group-label">base .ino</span>
            {baseIno ? (
              <span>
                {baseIno.source === "auto"
                  ? `loaded from server (${baseIno.content.length.toLocaleString()} chars)`
                  : `uploaded: ${baseIno.filename}`}
              </span>
            ) : baseError ? (
              <span className="muted">no base loaded ({baseError})</span>
            ) : (
              <span className="muted">loading…</span>
            )}
            <span className="spacer" />
            <button onClick={handleUploadBase}>Upload base .ino</button>
            {baseIno?.source === "uploaded" && (
              <button onClick={handleResetBase}>Use server copy</button>
            )}
          </div>
        </div>
      )}

      {!result.ok && <div className="error">{result.error}</div>}

      <pre style={{ flex: 1, minHeight: 400 }}>{result.ok ? result.value : ""}</pre>
    </div>
  );
}
