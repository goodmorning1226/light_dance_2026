// Pluggable Web Storage backend. Defaults to globalThis.localStorage when
// available (browser); SSR / Node uses no-op (returns null on read, ignores
// writes). Tests inject an InMemoryBackend via setStorageBackend().

export interface KvStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let override: KvStore | null = null;

export function setStorageBackend(backend: KvStore | null): void {
  override = backend;
}

function getBackend(): KvStore | null {
  if (override) return override;
  if (typeof globalThis !== "undefined") {
    const ls = (globalThis as { localStorage?: KvStore }).localStorage;
    if (ls) return ls;
  }
  return null;
}

export function readJson<T>(key: string, fallback: T): T | unknown {
  const backend = getBackend();
  if (!backend) return fallback;
  const text = backend.getItem(key);
  if (text === null || text === "") return fallback;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    console.warn(`[storage] corrupt JSON at "${key}", using fallback`);
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  const backend = getBackend();
  if (!backend) return;
  backend.setItem(key, JSON.stringify(value));
}

export function removeKey(key: string): void {
  const backend = getBackend();
  if (!backend) return;
  backend.removeItem(key);
}
