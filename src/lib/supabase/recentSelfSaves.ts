// In-memory record of cloud rows we recently wrote ourselves. Realtime
// emits our own change back to us — re-applying it would overwrite an
// in-progress local edit and blow away the cursor position. Each entry
// expires after a few seconds so a real change from another client (which
// arrives later) still gets applied.

const recents = new Map<string, number>();
const TTL_MS = 5_000;

function key(table: string, cloudId: string): string {
  return `${table}:${cloudId}`;
}

export function recordSelfSave(table: string, cloudId: string): void {
  const k = key(table, cloudId);
  recents.set(k, Date.now());
  // Lazy expiry: a single timeout per record. A flurry of saves doesn't
  // accumulate timers because we delete-then-set inside this single one.
  window.setTimeout(() => {
    const t = recents.get(k);
    if (t !== undefined && Date.now() - t >= TTL_MS - 50) {
      recents.delete(k);
    }
  }, TTL_MS);
}

export function isRecentSelfSave(table: string, cloudId: string): boolean {
  const t = recents.get(key(table, cloudId));
  if (t === undefined) return false;
  if (Date.now() - t > TTL_MS) {
    recents.delete(key(table, cloudId));
    return false;
  }
  return true;
}

export function clearRecentSelfSaves(): void {
  recents.clear();
}
