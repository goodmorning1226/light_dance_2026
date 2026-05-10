"use client";

import { useState } from "react";
import type {
  ExportSettings,
  ExportType,
  OfflineRunMode,
  ProgramArrangement,
} from "@/types";

interface Props {
  settings: ExportSettings;
  program: ProgramArrangement;
  onChange: (next: ExportSettings) => void;
}

const EXPORT_TYPE_LABEL: Record<ExportType, string> = {
  snippet: "Snippet",
  "full-offline-ino": "Full Offline .ino",
  "full-online-mqtt-ino": "Full Online MQTT .ino",
};

const RUN_MODE_LABEL: Record<OfflineRunMode, string> = {
  runArrangementOnce: "Run arrangement once",
  loopArrangement: "Loop arrangement (until power off)",
  runSelectedDance: "Run only the selected dance",
};

export function ExportSettingsForm({ settings, program, onChange }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const update = <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) =>
    onChange({ ...settings, [key]: value });

  const isOnline = settings.exportType === "full-online-mqtt-ino";
  const isOffline = settings.exportType === "full-offline-ino";

  return (
    <div className="card" style={{ padding: 8, fontSize: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <button
          className="ghost"
          onClick={() => setCollapsed(!collapsed)}
          style={{ width: 24, padding: "2px 4px" }}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "▶" : "▼"}
        </button>
        <strong>Export Settings</strong>
        <span className="muted">
          · {EXPORT_TYPE_LABEL[settings.exportType]}
          {settings.includeLegacyExampleDances ? " · with legacy" : " · minimal"}
          {isOffline ? ` · ${RUN_MODE_LABEL[settings.offlineRunMode]}` : ""}
        </span>
      </div>

      {!collapsed && (
        <div className="col" style={{ gap: 10, marginTop: 8 }}>
          <Row label="Export type">
            <select
              value={settings.exportType}
              onChange={(e) => update("exportType", e.target.value as ExportType)}
            >
              {(Object.keys(EXPORT_TYPE_LABEL) as ExportType[]).map((t) => (
                <option key={t} value={t}>{EXPORT_TYPE_LABEL[t]}</option>
              ))}
            </select>
            <label className="row" style={{ gap: 4 }}>
              <input
                type="checkbox"
                checked={settings.includeLegacyExampleDances}
                onChange={(e) => update("includeLegacyExampleDances", e.target.checked)}
              />
              <span>include legacy example songs</span>
            </label>
          </Row>

          {isOnline && (
            <>
              <SectionHeader label="WiFi" />
              <Row label="SSID">
                <input
                  value={settings.wifiSsid}
                  onChange={(e) => update("wifiSsid", e.target.value)}
                  style={{ flex: 1 }}
                />
              </Row>
              <Row label="Password">
                <input
                  type="password"
                  value={settings.wifiPassword}
                  onChange={(e) => update("wifiPassword", e.target.value)}
                  style={{ flex: 1 }}
                />
              </Row>

              <SectionHeader label="MQTT" />
              <Row label="Host">
                <input
                  value={settings.mqttHost}
                  onChange={(e) => update("mqttHost", e.target.value)}
                  style={{ flex: 1 }}
                />
              </Row>
              <Row label="Port">
                <input
                  type="number"
                  value={settings.mqttPort}
                  onChange={(e) => update("mqttPort", Number(e.target.value) || 0)}
                  style={{ width: 100 }}
                />
              </Row>
              <Row label="Topic">
                <input
                  value={settings.mqttTopic}
                  onChange={(e) => update("mqttTopic", e.target.value)}
                  style={{ flex: 1 }}
                />
              </Row>
              <Row label="Client ID prefix">
                <input
                  value={settings.mqttClientIdPrefix}
                  onChange={(e) => update("mqttClientIdPrefix", e.target.value)}
                  style={{ flex: 1, fontFamily: "monospace" }}
                />
              </Row>
            </>
          )}

          <SectionHeader label="Costume identity (default 1, change only if needed)" />
          <Row label="DANCER / PERSON / ROLE">
            <input
              type="number"
              min={0}
              value={settings.dancerId}
              onChange={(e) => update("dancerId", Number(e.target.value) || 0)}
              style={{ width: 80 }}
              title="DANCER"
            />
            <input
              type="number"
              min={0}
              value={settings.personId}
              onChange={(e) => update("personId", Number(e.target.value) || 0)}
              style={{ width: 80 }}
              title="PERSON"
            />
            <input
              type="number"
              min={0}
              value={settings.roleId}
              onChange={(e) => update("roleId", Number(e.target.value) || 0)}
              style={{ width: 80 }}
              title="ROLE"
            />
          </Row>

          <SectionHeader label="LED hardware (defaults match light_dance_2026.ino)" />
          <Row label="LED_PIN / NUM_LEDS / BRIGHTNESS">
            <input
              type="number"
              min={0}
              value={settings.ledPin}
              onChange={(e) => update("ledPin", Number(e.target.value) || 0)}
              style={{ width: 70 }}
              title="LED_PIN"
            />
            <input
              type="number"
              min={1}
              value={settings.numLeds}
              onChange={(e) => update("numLeds", Number(e.target.value) || 1)}
              style={{ width: 90 }}
              title="NUM_LEDS"
            />
            <input
              type="number"
              min={0}
              max={255}
              value={settings.brightness}
              onChange={(e) => update("brightness", Number(e.target.value) || 0)}
              style={{ width: 70 }}
              title="BRIGHTNESS (0-255)"
            />
          </Row>
          <Row label="LED_TYPE / COLOR_ORDER">
            <input
              value={settings.ledType}
              onChange={(e) => update("ledType", e.target.value)}
              style={{ width: 110, fontFamily: "monospace" }}
              placeholder="WS2812"
            />
            <input
              value={settings.colorOrder}
              onChange={(e) => update("colorOrder", e.target.value)}
              style={{ width: 70, fontFamily: "monospace" }}
              placeholder="GRB"
            />
          </Row>

          {isOffline && (
            <>
              <SectionHeader label="Offline run behaviour" />
              <Row label="Run mode">
                <select
                  value={settings.offlineRunMode}
                  onChange={(e) => update("offlineRunMode", e.target.value as OfflineRunMode)}
                >
                  {(Object.keys(RUN_MODE_LABEL) as OfflineRunMode[]).map((m) => (
                    <option key={m} value={m}>{RUN_MODE_LABEL[m]}</option>
                  ))}
                </select>
              </Row>
              {settings.offlineRunMode === "runSelectedDance" && (
                <Row label="Selected dance">
                  <select
                    value={settings.offlineSelectedDanceId ?? ""}
                    onChange={(e) => {
                      const next: ExportSettings = { ...settings };
                      if (e.target.value) {
                        next.offlineSelectedDanceId = e.target.value;
                      } else {
                        delete next.offlineSelectedDanceId;
                      }
                      onChange(next);
                    }}
                    style={{ flex: 1 }}
                  >
                    <option value="">— pick a dance from arrangement —</option>
                    {program.items.map((item) => (
                      <option key={item.id} value={item.danceId}>
                        {item.dance?.name ?? item.danceId}  ({item.mqttCommand})
                      </option>
                    ))}
                  </select>
                </Row>
              )}
              <Row label="">
                <label className="row" style={{ gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={settings.loopAfterFinish}
                    onChange={(e) => update("loopAfterFinish", e.target.checked)}
                  />
                  <span>loop after finish (only applies to runSelectedDance)</span>
                </label>
              </Row>
            </>
          )}

          <SectionHeader label="Hooks" />
          <Row label="">
            <label className="row" style={{ gap: 4 }}>
              <input
                type="checkbox"
                checked={settings.showReadySignalBeforeDance}
                onChange={(e) => update("showReadySignalBeforeDance", e.target.checked)}
              />
              <span>showReadySignal() before dance</span>
            </label>
          </Row>
          <Row label="">
            <label className="row" style={{ gap: 4 }}>
              <input
                type="checkbox"
                checked={settings.showEndSignalAfterDance}
                onChange={(e) => update("showEndSignalAfterDance", e.target.checked)}
              />
              <span>showEndSignal() after dance</span>
            </label>
          </Row>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row" style={{ gap: 6, alignItems: "center" }}>
      <span className="group-label" style={{ width: 130, flexShrink: 0 }}>
        {label}
      </span>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", flex: 1 }}>{children}</div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        borderTop: "1px solid #e2e8f0",
        paddingTop: 6,
        fontSize: 11,
        fontWeight: 600,
        color: "#475569",
        textTransform: "uppercase",
        letterSpacing: 0.05,
      }}
    >
      {label}
    </div>
  );
}
