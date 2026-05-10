// Validation primitives shared by every parser. Each helper either returns a
// narrowed value or throws an ImportError annotated with the JSON path so the
// caller can pinpoint the offending field.

export class ImportError extends Error {
  readonly path: string;
  readonly bareMessage: string;

  constructor(path: string, message: string) {
    super(path ? `${message} (at ${path})` : message);
    this.name = "ImportError";
    this.path = path;
    this.bareMessage = message;
  }
}

export function describeType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export function asObject(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new ImportError(path, `Expected object, got ${describeType(v)}`);
  }
  return v as Record<string, unknown>;
}

export function asArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) {
    throw new ImportError(path, `Expected array, got ${describeType(v)}`);
  }
  return v;
}

export function asString(v: unknown, path: string): string {
  if (typeof v !== "string") {
    throw new ImportError(path, `Expected string, got ${describeType(v)}`);
  }
  return v;
}

export function asNumber(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ImportError(path, `Expected finite number, got ${describeType(v)}`);
  }
  return v;
}

export function asBoolean(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") {
    throw new ImportError(path, `Expected boolean, got ${describeType(v)}`);
  }
  return v;
}

// Build a path segment, dropping the leading dot when the parent is the root.
export function joinPath(parent: string, child: string): string {
  if (!parent) return child;
  if (child.startsWith("[")) return parent + child;
  return `${parent}.${child}`;
}

// JSON.parse never produces `undefined` for present keys, so a missing key is
// exactly the case where `obj[key] === undefined`.
export function requireField<T>(
  obj: Record<string, unknown>,
  key: string,
  parentPath: string,
  parse: (v: unknown, path: string) => T,
): T {
  const fieldPath = joinPath(parentPath, key);
  if (obj[key] === undefined) {
    throw new ImportError(fieldPath, `Missing required field "${key}"`);
  }
  return parse(obj[key], fieldPath);
}
