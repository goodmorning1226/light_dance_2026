"use client";

import { useEffect, useState } from "react";
import type { CustomAnimation } from "@/types";
import {
  deleteCustomAnimation,
  getAllCustomAnimations,
  saveCustomAnimation,
} from "@/lib/storage";
import {
  exportCustomAnimationToJson,
  importCustomAnimationFromJson,
} from "@/lib/io";
import { BuiltInAnimationsList } from "./BuiltInAnimationsList";
import { CustomAnimationCard } from "./CustomAnimationCard";

type Notice = { kind: "info" | "error"; text: string } | null;

export function LibraryClient() {
  const [customs, setCustoms] = useState<CustomAnimation[] | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    setCustoms(getAllCustomAnimations());
  }, []);

  const refresh = () => setCustoms(getAllCustomAnimations());

  const flash = (n: Notice) => {
    setNotice(n);
    if (n) window.setTimeout(() => setNotice(null), 5000);
  };

  const handleImport = async () => {
    const text = await pickJsonFile();
    if (text === null) return;
    try {
      const imported = importCustomAnimationFromJson(text);
      const existing = getAllCustomAnimations();

      // functionName must be unique across the registry — codegen would throw
      // anyway, but blocking here gives the user a clearer error.
      const fnConflict = existing.find(
        (c) => c.functionName === imported.functionName && c.id !== imported.id,
      );
      if (fnConflict) {
        flash({
          kind: "error",
          text: `functionName "${imported.functionName}" already used by "${fnConflict.name}" (id=${fnConflict.id}). Pick a different name.`,
        });
        return;
      }

      const idConflict = existing.find((c) => c.id === imported.id);
      if (idConflict) {
        const ok = window.confirm(
          `An animation with id "${imported.id}" already exists ("${idConflict.name}"). Replace it?`,
        );
        if (!ok) return;
      }

      saveCustomAnimation(imported);
      refresh();
      flash({ kind: "info", text: `Imported "${imported.name}".` });
    } catch (e) {
      flash({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleExport = (ca: CustomAnimation) => {
    downloadFile(`${ca.functionName || ca.id}.json`, exportCustomAnimationToJson(ca));
  };

  const handleDelete = (ca: CustomAnimation) => {
    if (!window.confirm(
      `Delete "${ca.name}" from the library?\n` +
        `Any dance that already uses it keeps its embedded snapshot.`,
    )) return;
    deleteCustomAnimation(ca.id);
    refresh();
  };

  if (!customs) {
    return <div className="muted" style={{ padding: 24 }}>Loading…</div>;
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        padding: 12,
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }} className="col">
        <header className="card" style={{ marginBottom: 12 }}>
          <div className="row">
            <strong style={{ fontSize: 16 }}>Animation Library</strong>
            <span className="spacer" />
            <button className="primary" onClick={handleImport}>
              Import Custom Animation JSON
            </button>
          </div>
          <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            Custom animations follow signature{" "}
            <code style={{ fontFamily: "monospace" }}>
              void functionName(const BodyPart&amp; part, CRGB color, int duration)
            </code>
            . Multiple dances using the same custom emit the function once.
          </div>
        </header>

        {notice && (
          <div
            className={notice.kind === "error" ? "error" : "card"}
            style={{ marginBottom: 12 }}
          >
            {notice.text}
          </div>
        )}

        <section style={{ marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: 14, color: "#475569" }}>
            Built-in animations
          </h3>
          <BuiltInAnimationsList />
        </section>

        <section>
          <div className="row" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14, color: "#475569" }}>
              Custom animations
            </h3>
            <span className="muted">{customs.length} total</span>
          </div>

          {customs.length === 0 ? (
            <div className="card muted" style={{ textAlign: "center", padding: 24 }}>
              No custom animations yet. Click "Import Custom Animation JSON" above.
            </div>
          ) : (
            <div className="col" style={{ gap: 10 }}>
              {customs.map((ca) => (
                <CustomAnimationCard
                  key={ca.id}
                  animation={ca}
                  onExport={() => handleExport(ca)}
                  onDelete={() => handleDelete(ca)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function pickJsonFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const text = await file.text();
      resolve(text);
    };
    input.click();
  });
}
