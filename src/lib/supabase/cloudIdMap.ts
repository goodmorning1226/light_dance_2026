"use client";

// Bridges the local id format (e.g. "dance-mxz0a..."), which is the only
// thing localStorage and the editor know about, to the cloud's uuid PKs.
// Stored per-program in localStorage so re-joining the same program
// reconnects to the right cloud rows.

export type CloudIdKind = "dances" | "programItems" | "customAnimations";

interface CloudIdMap {
  dances: Record<string, string>;
  programItems: Record<string, string>;
  customAnimations: Record<string, string>;
}

const KEY_PREFIX = "ld26:cloudIdMap:";

function emptyMap(): CloudIdMap {
  return { dances: {}, programItems: {}, customAnimations: {} };
}

function read(programId: string): CloudIdMap {
  if (typeof window === "undefined") return emptyMap();
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + programId);
    if (!raw) return emptyMap();
    const parsed = JSON.parse(raw) as Partial<CloudIdMap>;
    return {
      dances: parsed.dances ?? {},
      programItems: parsed.programItems ?? {},
      customAnimations: parsed.customAnimations ?? {},
    };
  } catch {
    return emptyMap();
  }
}

function write(programId: string, map: CloudIdMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_PREFIX + programId, JSON.stringify(map));
  } catch {
    // localStorage might be disabled — mappings will not survive page
    // reload, but the in-memory cache stays intact for the session.
  }
}

export function getCloudId(
  programId: string,
  kind: CloudIdKind,
  localId: string,
): string | null {
  const map = read(programId);
  return map[kind][localId] ?? null;
}

export function setCloudId(
  programId: string,
  kind: CloudIdKind,
  localId: string,
  cloudId: string,
): void {
  const map = read(programId);
  map[kind][localId] = cloudId;
  write(programId, map);
}

export function getOrCreateCloudId(
  programId: string,
  kind: CloudIdKind,
  localId: string,
): { cloudId: string; isNew: boolean } {
  const existing = getCloudId(programId, kind, localId);
  if (existing) return { cloudId: existing, isNew: false };
  const fresh = generateUuid();
  setCloudId(programId, kind, localId, fresh);
  return { cloudId: fresh, isNew: true };
}

// Returns localId for a given cloudId, or null. Used when realtime updates
// arrive and we need to find the corresponding local entry.
export function findLocalIdByCloudId(
  programId: string,
  kind: CloudIdKind,
  cloudId: string,
): string | null {
  const map = read(programId);
  for (const [local, cloud] of Object.entries(map[kind])) {
    if (cloud === cloudId) return local;
  }
  return null;
}

export function clearCloudIdMap(programId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY_PREFIX + programId);
  } catch {
    // ignore
  }
}

function generateUuid(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  // RFC4122-ish fallback for older runtimes (Node 14, very old Safari).
  // Not cryptographically strong but unique enough as an id.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
