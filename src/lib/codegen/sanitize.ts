// Strip every character that isn't [A-Za-z0-9_]. Chinese characters,
// whitespace, hyphens, and punctuation all collapse out, so "Sample Dance"
// becomes "SampleDance" and "什麼" becomes "" (handled by the fallback).
const VALID_CHAR = /[a-zA-Z0-9_]/;
const STARTS_WITH_LETTER_OR_UNDERSCORE = /^[a-zA-Z_]/;

export function sanitizeCppIdentifier(input: string): string {
  let cleaned = "";
  for (const ch of input) {
    if (VALID_CHAR.test(ch)) cleaned += ch;
  }
  if (cleaned.length === 0) return "Dance";
  if (!STARTS_WITH_LETTER_OR_UNDERSCORE.test(cleaned)) return `Dance_${cleaned}`;
  return cleaned;
}

// Returns a copy of `names` with collisions broken by `_1`, `_2`, ... suffixes.
// Only repeated names get suffixed — singletons pass through unchanged.
//
//   ["Intro", "Chorus", "Chorus"]   → ["Intro", "Chorus_1", "Chorus_2"]
//   ["Dance", "Dance", "Dance"]     → ["Dance_1", "Dance_2", "Dance_3"]
//
// Used to produce unique C++ function names when multiple sections (or dances)
// sanitize to the same identifier.
export function dedupeIdentifiers(names: ReadonlyArray<string>): string[] {
  const totals = new Map<string, number>();
  for (const name of names) totals.set(name, (totals.get(name) ?? 0) + 1);
  const used = new Map<string, number>();
  return names.map((name) => {
    if ((totals.get(name) ?? 0) <= 1) return name;
    const idx = (used.get(name) ?? 0) + 1;
    used.set(name, idx);
    return `${name}_${idx}`;
  });
}
