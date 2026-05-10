import type { CustomAnimation } from "./customAnimation";
import type { DanceProject } from "./dance";
import type { ExportSettings } from "./exportSettings";

// Mirrors the Supabase `programs` row, in camelCase.
export interface CloudProgram {
  id: string;
  name: string;
  shareCode: string;
  schemaVersion: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// `program_members` joined with `profiles.display_name`.
export interface ProgramMember {
  programId: string;
  userId: string;
  role: "owner" | "editor" | "viewer";
  displayName: string;
  joinedAt: string;
}

// `dances` row. `danceJson` is the parsed DanceProject object — its `id`
// field is the LOCAL id (string like "dance-..."), distinct from the
// Postgres uuid in `id`. The id-mapping helper in `lib/supabase/cloudIdMap`
// translates between them.
export interface CloudDance {
  id: string;            // cloud uuid (PK)
  programId: string;
  name: string | null;
  danceJson: DanceProject;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// `program_items` row.
export interface CloudProgramItem {
  id: string;            // cloud uuid (PK)
  programId: string;
  danceId: string;       // FK to CloudDance.id (cloud uuid)
  orderIndex: number;
  mqttCommand: string;
  createdAt: string;
  updatedAt: string;
}

// `custom_animations` row.
export interface CloudCustomAnimation {
  id: string;            // cloud uuid (PK)
  programId: string;
  animationJson: CustomAnimation;
  createdAt: string;
  updatedAt: string;
}

// `export_settings` row. PK = programId (1:1).
export interface CloudExportSettings {
  programId: string;
  settingsJson: ExportSettings;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// Phase-3 placeholder — used when realtime presence/broadcast hooks land.
// Kept here so consumers can already type their UI against the eventual shape.
export interface CollaborationState {
  onlineUsers: ProgramMember[];
  // userId → "currently editing" snapshot; populated by Phase-3 broadcast.
  editingByUser: Record<string, {
    danceId?: string;
    eventId?: string;
    viewMode?: string;
    dancerTab?: number;
  }>;
}

// Sync status surfaced in the top-bar badge.
export type CollaborationStatus =
  | "local"            // Local Mode — no cloud session active
  | "connecting"       // anon sign-in / RPC in progress
  | "connected"        // session live, last save succeeded
  | "saving"           // a save is in flight
  | "saved"            // brief flash after a successful save
  | "error";           // most recent operation failed

// The active cloud session, set by CloudModeProvider once a user is signed
// in and inside a program. `null` while in Local Mode.
export interface CloudModeState {
  program: CloudProgram;
  members: ProgramMember[];
  myUserId: string;
  myDisplayName: string;
  myRole: ProgramMember["role"];
}
