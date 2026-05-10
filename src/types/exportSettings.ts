// User-tunable settings consumed by the .ino exporters. Default values match
// the hardcoded constants in `light_dance_2026.ino`, so a fresh install with
// untouched settings produces an .ino byte-equivalent (in spirit) to the
// existing project — only the generated dance/callback blocks differ.

export type ExportType = "snippet" | "full-offline-ino" | "full-online-mqtt-ino";

export type OfflineRunMode =
  | "runArrangementOnce"
  | "loopArrangement"
  | "runSelectedDance";

export interface ExportSettings {
  exportType: ExportType;
  includeLegacyExampleDances: boolean;

  // WiFi credentials inlined into the generated `const char* ssid` / `password`.
  wifiSsid: string;
  wifiPassword: string;

  // MQTT broker connection. `mqttHost` → `mqtt_server`; `mqttPort` becomes a
  // new `const int mqtt_port` global; `mqttClientIdPrefix` replaces the
  // hardcoded `"ESP32_Client_"` prefix in `reconnect()`.
  mqttHost: string;
  mqttPort: number;
  mqttTopic: string;
  mqttClientIdPrefix: string;

  // Costume identity — the .ino-side constants the existing dance code
  // already keys off. v1 defaults all three to 1.
  dancerId: number;
  personId: number;
  roleId: number;

  // LED hardware. Default values come from light_dance_2026.ino's existing
  // `#define`s; only change if your hardware actually differs.
  ledPin: number;
  numLeds: number;
  brightness: number;
  ledType: string;
  colorOrder: string;

  // Offline-only behaviour. Ignored when exportType is online or snippet.
  offlineRunMode: OfflineRunMode;
  offlineSelectedDanceId?: string;

  // Hooks fired around each dance trigger (online MQTT branches) and around
  // the offlineTest body (offline boot run).
  showReadySignalBeforeDance: boolean;
  showEndSignalAfterDance: boolean;
  loopAfterFinish: boolean;
}

export function defaultExportSettings(): ExportSettings {
  return {
    exportType: "full-online-mqtt-ino",
    includeLegacyExampleDances: false,

    wifiSsid: "IMPR",
    wifiPassword: "pierre2001",

    mqttHost: "192.168.31.209",
    mqttPort: 1883,
    mqttTopic: "LED_TOPIC",
    mqttClientIdPrefix: "ESP32_Client_",

    dancerId: 1,
    personId: 1,
    roleId: 1,

    ledPin: 13,
    numLeds: 1000,
    brightness: 7,
    ledType: "WS2812",
    colorOrder: "GRB",

    offlineRunMode: "runArrangementOnce",
    showReadySignalBeforeDance: false,
    showEndSignalAfterDance: false,
    loopAfterFinish: false,
  };
}
