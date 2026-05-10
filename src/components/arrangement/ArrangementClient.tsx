"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExportSettings, ProgramArrangement, ProgramItem } from "@/types";
import { defaultExportSettings } from "@/types";
import {
  addDanceToProgram,
  duplicateProgramItem,
  getDance,
  getExportSettings,
  getProgram,
  removeDanceFromProgram,
  reorderProgramItems,
  saveDance,
  saveExportSettings,
  saveProgram,
  setCurrentDanceId,
  updateProgramItem,
} from "@/lib/storage";
import {
  exportDanceToJson,
  exportProgramToJson,
  importDanceFromJson,
} from "@/lib/io";
import { useCloud } from "@/components/cloud/CloudModeProvider";
import { getCloudId } from "@/lib/supabase/cloudIdMap";
import { ProgramItemRow } from "./ProgramItemRow";
import { ExportPanel } from "./ExportPanel";
import { ExportSettingsForm } from "./ExportSettingsForm";

type Notice = { kind: "info" | "error"; text: string } | null;

export function ArrangementClient() {
  const router = useRouter();
  const cloud = useCloud();
  const [program, setProgram] = useState<ProgramArrangement | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(defaultExportSettings);

  useEffect(() => {
    setProgram(getProgram());
    setExportSettings(getExportSettings());
  }, []);

  // Re-read from localStorage when realtime applies arrangement / export
  // changes from another collaborator.
  const programItemsCounter = cloud.counters.programItems;
  const danceCounter = cloud.counters.dances;
  useEffect(() => {
    setProgram(getProgram());
  }, [programItemsCounter, danceCounter]);

  const exportSettingsCounter = cloud.counters.exportSettings;
  useEffect(() => {
    setExportSettings(getExportSettings());
  }, [exportSettingsCounter]);

  // Pull stable callback out so the effect doesn't re-fire on every
  // counter bump / presence sync (which would re-publish presence and
  // can flicker on the receiver side). updateMyPresence is wrapped in
  // useCallback with empty deps inside the provider — stable identity.
  const { updateMyPresence } = cloud;
  const inCloud = cloud.state !== null;
  // Publish presence so collaborators know we're on the arrangement page.
  useEffect(() => {
    if (!inCloud) return;
    updateMyPresence({
      currentView: "arrangement",
      currentDanceId: undefined,
      currentEventId: undefined,
    });
  }, [inCloud, updateMyPresence]);

  const updateExportSettings = (next: ExportSettings) => {
    setExportSettings(next);
    saveExportSettings(next);
  };

  const refresh = () => setProgram(getProgram());

  const flash = (n: Notice) => {
    setNotice(n);
    if (n) window.setTimeout(() => setNotice(null), 4000);
  };

  const handleRenameProgram = (name: string) => {
    if (!program) return;
    const updated: ProgramArrangement = { ...program, name };
    saveProgram(updated);
    setProgram(updated);
  };

  const handleEdit = (item: ProgramItem) => {
    const dance = item.dance;
    if (!dance) {
      flash({ kind: "error", text: "This item has no embedded dance, cannot edit." });
      return;
    }
    // The arrangement's snapshot may exist even if the dance was deleted from
    // the dances list. Re-save so the editor finds it on mount.
    if (!getDance(dance.id)) saveDance(dance);
    setCurrentDanceId(dance.id);
    router.push("/");
  };

  const handleUpdateMqtt = (id: string, cmd: string) => {
    updateProgramItem(id, { mqttCommand: cmd });
    refresh();
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this item from the arrangement?")) return;
    removeDanceFromProgram(id);
    refresh();
  };

  const handleDuplicate = (id: string) => {
    duplicateProgramItem(id);
    refresh();
  };

  const handleMove = (id: string, delta: -1 | 1) => {
    if (!program) return;
    const idx = program.items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    reorderProgramItems(idx, idx + delta);
    refresh();
  };

  const handleImportDance = async () => {
    const text = await pickJsonFile();
    if (text === null) return;
    const cmd = window.prompt(
      "MQTT command for the imported dance:",
      "ON_OPENING",
    );
    if (!cmd) return;
    try {
      const dance = importDanceFromJson(text);
      saveDance(dance);
      addDanceToProgram(dance, cmd);
      refresh();
      flash({ kind: "info", text: `Imported "${dance.name}" → ${cmd}.` });
    } catch (e) {
      flash({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleExportDanceJson = (item: ProgramItem) => {
    if (!item.dance) return;
    downloadFile(
      `${item.dance.name || "dance"}.json`,
      exportDanceToJson(item.dance),
      "application/json",
    );
  };

  const handleExportProgramJson = () => {
    if (!program) return;
    downloadFile(
      `${program.name || "program"}.json`,
      exportProgramToJson(program),
      "application/json",
    );
  };

  if (!program) {
    return <div className="muted" style={{ padding: 24 }}>Loading…</div>;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(440px, 560px)",
        gap: 12,
        padding: 12,
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div className="col" style={{ gap: 12, overflow: "auto", paddingRight: 4 }}>
        <div className="card">
          <div className="row" style={{ gap: 8 }}>
            <span className="group-label" style={{ width: 60 }}>Program</span>
            <input
              value={program.name}
              onChange={(e) => handleRenameProgram(e.target.value)}
              style={{ flex: 1, fontSize: 16, fontWeight: 600 }}
            />
            <button onClick={handleImportDance}>Import Dance JSON</button>
            <button onClick={handleExportProgramJson}>Export Program JSON</button>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            {program.items.length} item{program.items.length === 1 ? "" : "s"}
          </div>
        </div>

        {notice && (
          <div className={notice.kind === "error" ? "error" : "card"}>
            {notice.text}
          </div>
        )}

        {program.items.length === 0 ? (
          <div className="card muted" style={{ textAlign: "center", padding: 32 }}>
            <p>No items yet.</p>
            <p>
              Open <a href="/">Editor</a>, edit a dance, and click "Add to Arrangement".
              <br />
              Or import a Dance JSON above.
            </p>
          </div>
        ) : (
          <div className="col" style={{ gap: 8 }}>
            {program.items.map((item, idx) => {
              const pid = cloud.state?.program.id ?? null;
              // In Local Mode the badge is hidden entirely (cloudSync=null).
              // In Cloud Mode an item is "synced" iff BOTH its program_items
              // row and its referenced dance row have cloud-id mappings —
              // either missing means a teammate would see a dangling ref.
              const cloudSync: boolean | null = pid
                ? getCloudId(pid, "programItems", item.id) !== null &&
                  getCloudId(pid, "dances", item.danceId) !== null
                : null;
              return (
              <ProgramItemRow
                key={item.id}
                item={item}
                index={idx}
                total={program.items.length}
                cloudSync={cloudSync}
                onEdit={() => handleEdit(item)}
                onUpdateMqtt={(cmd) => handleUpdateMqtt(item.id, cmd)}
                onDelete={() => handleDelete(item.id)}
                onDuplicate={() => handleDuplicate(item.id)}
                onMoveUp={() => handleMove(item.id, -1)}
                onMoveDown={() => handleMove(item.id, 1)}
                onExportDanceJson={() => handleExportDanceJson(item)}
              />
              );
            })}
          </div>
        )}
      </div>

      <div className="col" style={{ gap: 8, overflow: "hidden", minHeight: 0 }}>
        <ExportSettingsForm
          settings={exportSettings}
          program={program}
          onChange={updateExportSettings}
        />
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <ExportPanel program={program} settings={exportSettings} />
        </div>
      </div>
    </div>
  );
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
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
