"use client";

import type {
  CloudCustomAnimation,
  CloudDance,
  CloudExportSettings,
  CloudProgram,
  CloudProgramItem,
  CustomAnimation,
  DanceProject,
  ExportSettings,
  ProgramMember,
} from "@/types";
import { ensureSignedIn } from "./auth";
import { getSupabaseClient } from "./client";
import { setCloudId } from "./cloudIdMap";

export interface CreatedProgram {
  programId: string;
  shareCode: string;
}

// Calls the SECURITY DEFINER RPC `create_program_with_owner`. The user is
// signed in anonymously first if they don't already have a session.
export async function createCloudProgram(
  programName: string,
  displayName: string,
): Promise<CreatedProgram> {
  if (!programName.trim()) throw new Error("programName is required");
  await ensureSignedIn(displayName);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("create_program_with_owner", {
    program_name: programName.trim(),
    display_name: displayName.trim(),
  });
  if (error) throw new Error(`createCloudProgram failed: ${error.message}`);
  const row = (data as Array<{ program_id: string; share_code: string }> | null)?.[0];
  if (!row) throw new Error("createCloudProgram: RPC returned no row");
  return { programId: row.program_id, shareCode: row.share_code };
}

export interface JoinedProgram {
  programId: string;
  role: ProgramMember["role"];
}

export async function joinProgramByShareCode(
  shareCode: string,
  displayName: string,
): Promise<JoinedProgram> {
  const code = shareCode.trim().toUpperCase();
  if (!code) throw new Error("shareCode is required");
  await ensureSignedIn(displayName);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("join_program_by_share_code", {
    input_share_code: code,
    display_name: displayName.trim(),
  });
  if (error) throw new Error(`joinProgramByShareCode failed: ${error.message}`);
  const row = (data as Array<{ program_id: string; role: ProgramMember["role"] }> | null)?.[0];
  if (!row) throw new Error("joinProgramByShareCode: RPC returned no row");
  return { programId: row.program_id, role: row.role };
}

export interface CloudProgramSnapshot {
  program: CloudProgram;
  members: ProgramMember[];
  dances: CloudDance[];
  programItems: CloudProgramItem[];
  customAnimations: CloudCustomAnimation[];
  exportSettings: CloudExportSettings | null;
}

// Loads everything the editor needs in a single round trip's worth of
// queries. Throws on any individual error rather than silently returning
// partial data — partial state would make the UI lie.
export async function loadCloudProgram(programId: string): Promise<CloudProgramSnapshot> {
  const supabase = getSupabaseClient();

  const [
    programRes,
    membersRes,
    dancesRes,
    itemsRes,
    customsRes,
    settingsRes,
  ] = await Promise.all([
    supabase.from("programs").select("*").eq("id", programId).single(),
    supabase
      .from("program_members")
      .select("program_id,user_id,role,joined_at,profiles!inner(display_name)")
      .eq("program_id", programId),
    supabase.from("dances").select("*").eq("program_id", programId),
    supabase
      .from("program_items")
      .select("*")
      .eq("program_id", programId)
      .order("order_index", { ascending: true }),
    supabase.from("custom_animations").select("*").eq("program_id", programId),
    supabase.from("export_settings").select("*").eq("program_id", programId).maybeSingle(),
  ]);

  if (programRes.error) throw new Error(`load program: ${programRes.error.message}`);
  if (membersRes.error) throw new Error(`load members: ${membersRes.error.message}`);
  if (dancesRes.error) throw new Error(`load dances: ${dancesRes.error.message}`);
  if (itemsRes.error) throw new Error(`load program_items: ${itemsRes.error.message}`);
  if (customsRes.error) throw new Error(`load custom_animations: ${customsRes.error.message}`);
  if (settingsRes.error) throw new Error(`load export_settings: ${settingsRes.error.message}`);

  const program = mapProgramRow(programRes.data as ProgramRow);
  const members = (membersRes.data as MemberRow[]).map(mapMemberRow);
  const dances = (dancesRes.data as DanceRow[]).map(mapDanceRow);
  const programItems = (itemsRes.data as ProgramItemRow[]).map(mapProgramItemRow);
  const customAnimations = (customsRes.data as CustomAnimationRow[]).map(mapCustomAnimationRow);
  const exportSettings = settingsRes.data
    ? mapExportSettingsRow(settingsRes.data as ExportSettingsRow)
    : null;

  // Seed the local-id ↔ cloud-id mapping from what we just downloaded so
  // subsequent saves upsert the right rows.
  for (const d of dances) setCloudId(programId, "dances", d.danceJson.id, d.id);
  for (const c of customAnimations) {
    setCloudId(programId, "customAnimations", c.animationJson.id, c.id);
  }
  // program_items map: we key on the local item id stored as part of
  // mqtt_command? No — items don't carry a local id in the JSON. We use
  // the cloud row id directly for items in CloudModeProvider state.

  return { program, members, dances, programItems, customAnimations, exportSettings };
}

// ===== Row mappers =====

interface ProgramRow {
  id: string;
  name: string;
  share_code: string;
  schema_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  program_id: string;
  user_id: string;
  role: ProgramMember["role"];
  joined_at: string;
  // PostgREST `profiles!inner(...)` returns an array even though the FK
  // guarantees at most one row. We normalise in the mapper.
  profiles: { display_name: string }[] | { display_name: string } | null;
}

interface DanceRow {
  id: string;
  program_id: string;
  name: string | null;
  dance_json: DanceProject;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ProgramItemRow {
  id: string;
  program_id: string;
  dance_id: string;
  order_index: number;
  mqtt_command: string;
  created_at: string;
  updated_at: string;
}

interface CustomAnimationRow {
  id: string;
  program_id: string;
  animation_json: CustomAnimation;
  created_at: string;
  updated_at: string;
}

interface ExportSettingsRow {
  program_id: string;
  settings_json: ExportSettings;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function mapProgramRow(r: ProgramRow): CloudProgram {
  return {
    id: r.id,
    name: r.name,
    shareCode: r.share_code,
    schemaVersion: r.schema_version,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapMemberRow(r: MemberRow): ProgramMember {
  let displayName = "Guest";
  if (Array.isArray(r.profiles)) {
    displayName = r.profiles[0]?.display_name ?? "Guest";
  } else if (r.profiles) {
    displayName = r.profiles.display_name;
  }
  return {
    programId: r.program_id,
    userId: r.user_id,
    role: r.role,
    displayName,
    joinedAt: r.joined_at,
  };
}

function mapDanceRow(r: DanceRow): CloudDance {
  return {
    id: r.id,
    programId: r.program_id,
    name: r.name,
    danceJson: r.dance_json,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapProgramItemRow(r: ProgramItemRow): CloudProgramItem {
  return {
    id: r.id,
    programId: r.program_id,
    danceId: r.dance_id,
    orderIndex: r.order_index,
    mqttCommand: r.mqtt_command,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapCustomAnimationRow(r: CustomAnimationRow): CloudCustomAnimation {
  return {
    id: r.id,
    programId: r.program_id,
    animationJson: r.animation_json,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapExportSettingsRow(r: ExportSettingsRow): CloudExportSettings {
  return {
    programId: r.program_id,
    settingsJson: r.settings_json,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
