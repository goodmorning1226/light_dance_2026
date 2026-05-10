import type { DanceProject } from "./dance";

// A ProgramArrangement is the top-level export unit: an ordered list of
// dances, each tagged with the MQTT command that should trigger it.
//
// `dance` is an optional embedded snapshot of the referenced DanceProject so
// that an exported Program JSON is self-contained without a separate dance
// registry. When unset, callers must resolve `danceId` against their own
// store.
export interface ProgramItem {
  id: string;
  danceId: string;
  mqttCommand: string;
  dance?: DanceProject;
}

export interface ProgramArrangement {
  schemaVersion: number;
  type: "led-program";
  id: string;
  name: string;
  items: ProgramItem[];
}

// "offline" → standalone .ino, no WiFi/MQTT, kicks off dances directly from
//             setup() or an offlineTest() helper.
// "online"  → keeps the existing WiFi/MQTT plumbing; each ProgramItem becomes
//             a new `else if (messageTemp == "...") { danceXxx(); }` branch.
export type ExportMode = "offline" | "online";
