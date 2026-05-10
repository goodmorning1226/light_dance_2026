// Marker-based insertion + safe .ino patching utilities.
//
// All patches are idempotent: running them on already-patched output produces
// the same result. Anchors that can't be found cause an explicit throw rather
// than silently emitting a broken .ino.

export const FWD_START = "// === GENERATED LED DANCE FORWARD DECLS START ===";
export const FWD_END = "// === GENERATED LED DANCE FORWARD DECLS END ===";
export const CODE_START = "// === GENERATED LED DANCE CODE START ===";
export const CODE_END = "// === GENERATED LED DANCE CODE END ===";
export const MQTT_START = "// === GENERATED MQTT BRANCHES START ===";
export const MQTT_END = "// === GENERATED MQTT BRANCHES END ===";

interface FunctionRange {
  sigStart: number;
  sigEnd: number;
  bodyStart: number; // first char *after* the opening `{`
  bodyEnd: number; // position of the closing `}`
}

// Brace-counting search for a top-level function body. Doesn't honour string
// literals or comments — fine for our well-formed .ino which never embeds an
// unmatched `{` or `}` inside one.
//
// Patterns SHOULD end with `\{` so the regex itself rejects forward
// declarations (which end in `;`). When the pattern doesn't include `{`, we
// fall back to scanning forward — but bail if we cross a `;` first so a
// forward declaration doesn't fool us into walking into the next definition.
export function findFunctionBody(
  source: string,
  signaturePattern: RegExp,
): FunctionRange | null {
  const match = signaturePattern.exec(source);
  if (!match || match.index === undefined) return null;

  const sigStart = match.index;
  const matchEnd = match.index + match[0].length;

  let openIdx: number;
  if (source[matchEnd - 1] === "{") {
    openIdx = matchEnd - 1;
  } else {
    openIdx = source.indexOf("{", matchEnd);
    if (openIdx < 0) return null;
    if (source.slice(matchEnd, openIdx).includes(";")) return null;
  }

  let depth = 1;
  let i = openIdx + 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  if (depth !== 0) return null;

  return { sigStart, sigEnd: matchEnd, bodyStart: openIdx + 1, bodyEnd: i - 1 };
}

// Generic marker-based insert/replace. If the markers are already present,
// replace the block between them; otherwise insert a fresh block at the
// position returned by `insertionFinder`.
export function insertMarkedBlock(
  base: string,
  payload: string,
  markerStart: string,
  markerEnd: string,
  insertionFinder: (base: string) => number,
): string {
  const startIdx = base.indexOf(markerStart);
  const endIdx = base.indexOf(markerEnd);

  const block = `${markerStart}\n${payload}\n${markerEnd}`;

  if (startIdx >= 0 && endIdx > startIdx) {
    return base.slice(0, startIdx) + block + base.slice(endIdx + markerEnd.length);
  }

  const pos = insertionFinder(base);
  const prefix = base.slice(0, pos);
  const suffix = base.slice(pos);
  // Make sure the block is delimited from neighbouring code by blank lines.
  const before = prefix.endsWith("\n\n") ? "" : prefix.endsWith("\n") ? "\n" : "\n\n";
  const after = suffix.startsWith("\n\n") ? "" : suffix.startsWith("\n") ? "\n" : "\n\n";
  return prefix + before + block + after + suffix;
}

// Drop-in for the user's spec — defaults to the dance-code markers and
// appends to the end of the file when no marker is present.
export function insertGeneratedCode(base: string, generatedCode: string): string {
  return insertMarkedBlock(base, generatedCode, CODE_START, CODE_END, (b) => b.length);
}

// Inserts the generated `else if (messageTemp == "...") { ... }` branches
// immediately before the closing `}` of `callback()`. Idempotent: an existing
// generated block (between MQTT_START / MQTT_END) is removed first, including
// the leading indent and the surrounding newlines that the previous insertion
// added.
export function insertMqttBranches(base: string, mqttBranches: string): string {
  let working = base;

  const existingStart = working.indexOf(MQTT_START);
  const existingEnd = working.indexOf(MQTT_END);
  if (existingStart >= 0 && existingEnd > existingStart) {
    let cutStart = existingStart;
    while (
      cutStart > 0 &&
      (working[cutStart - 1] === " " || working[cutStart - 1] === "\t")
    ) {
      cutStart--;
    }
    if (cutStart > 0 && working[cutStart - 1] === "\n") cutStart--;
    let cutEnd = existingEnd + MQTT_END.length;
    if (cutEnd < working.length && working[cutEnd] === "\n") cutEnd++;
    working = working.slice(0, cutStart) + working.slice(cutEnd);
  }

  const callbackBody = findFunctionBody(
    working,
    /void\s+callback\s*\(\s*char\s*\*[^)]*\)\s*\{/,
  );
  if (!callbackBody) {
    throw new Error(
      "Cannot find callback(char* ...) body in base .ino. Aborting full export to avoid producing a broken .ino — make sure baseInoSource has the original `void callback(char* topic, byte* message, unsigned int length)` function intact.",
    );
  }

  const indented = mqttBranches
    .split("\n")
    .map((l) => (l.length > 0 ? `    ${l}` : l))
    .join("\n");
  const block =
    `\n    ${MQTT_START} (inserted inside callback() if/else-if chain)\n` +
    `${indented}\n    ${MQTT_END}\n`;

  return (
    working.slice(0, callbackBody.bodyEnd) + block + working.slice(callbackBody.bodyEnd)
  );
}

// Strip any prior offline patches (the WiFi #if !OFFLINE_TEST guard and the
// `offlineTest()` entry block at the end of setup) so the next patch starts
// from a clean slate.
function stripPreviousSetupPatch(base: string): string {
  let working = base;
  working = working.replace(
    /\n#if\s+!OFFLINE_TEST\s*\n(\s*setup_wifi\(\);[\s\S]*?client\.setCallback\([^)]+\);)\s*\n#endif/g,
    "\n$1",
  );
  working = working.replace(
    /\n+#if\s+OFFLINE_TEST\s*\n\s*delay\(\d+\);\s*\n\s*offlineTest\(\);\s*\n#endif\s*\n*/g,
    "\n",
  );
  return working;
}

// Wraps the WiFi/MQTT init in `#if !OFFLINE_TEST` and adds a
// `#if OFFLINE_TEST offlineTest(); #endif` entry at the end of setup().
// Idempotent.
export function patchSetupForOffline(baseInoSource: string): string {
  let working = stripPreviousSetupPatch(baseInoSource);

  const setupBody = findFunctionBody(working, /void\s+setup\s*\(\s*\)\s*\{/);
  if (!setupBody) {
    throw new Error(
      "Cannot find setup() body in base .ino. Aborting full offline export.",
    );
  }

  const before = working.slice(0, setupBody.bodyStart);
  let inBody = working.slice(setupBody.bodyStart, setupBody.bodyEnd);
  const after = working.slice(setupBody.bodyEnd);

  const wifiPattern =
    /(\s*)setup_wifi\(\);\s*\n\s*client\.setServer\([^)]+\);\s*\n\s*client\.setCallback\([^)]+\);/;
  const wifiMatch = wifiPattern.exec(inBody);
  if (!wifiMatch) {
    throw new Error(
      "Cannot find WiFi/MQTT initialisation `setup_wifi(); client.setServer(...); client.setCallback(...);` inside setup(). Aborting full offline export so the output isn't silently broken.",
    );
  }

  const wrapped = `\n#if !OFFLINE_TEST${wifiMatch[0]}\n#endif`;
  inBody = inBody.replace(wifiPattern, wrapped);

  inBody = inBody.replace(
    /\s*$/,
    "\n\n#if OFFLINE_TEST\n    delay(2000);\n    offlineTest();\n#endif\n",
  );

  return before + inBody + after;
}

function stripPreviousLoopPatch(base: string): string {
  const loopBody = findFunctionBody(base, /void\s+loop\s*\(\s*\)\s*\{/);
  if (!loopBody) return base;

  const before = base.slice(0, loopBody.bodyStart);
  let inBody = base.slice(loopBody.bodyStart, loopBody.bodyEnd);
  const after = base.slice(loopBody.bodyEnd);

  inBody = inBody.replace(/\n#if\s+!OFFLINE_TEST\s*\n/, "\n");
  inBody = inBody.replace(/\n#endif(\s*)$/, "\n$1");

  return before + inBody + after;
}

// Wraps the entire loop() body in `#if !OFFLINE_TEST` so MQTT polling is
// skipped when running offline. Idempotent.
export function patchLoopForOffline(baseInoSource: string): string {
  let working = stripPreviousLoopPatch(baseInoSource);

  const loopBody = findFunctionBody(working, /void\s+loop\s*\(\s*\)\s*\{/);
  if (!loopBody) {
    throw new Error("Cannot find loop() body in base .ino. Aborting full offline export.");
  }

  const before = working.slice(0, loopBody.bodyStart);
  const inBody = working.slice(loopBody.bodyStart, loopBody.bodyEnd);
  const after = working.slice(loopBody.bodyEnd);

  if (!inBody.trim()) return working;

  const newBody = `\n#if !OFFLINE_TEST${inBody.replace(/\s*$/, "")}\n#endif\n`;
  return before + newBody + after;
}

// Removes everything we may have injected during a prior offline export so a
// subsequent online export starts from a clean baseline.
export function removeOfflinePatches(base: string): string {
  let working = base;
  working = working.replace(/^#define\s+OFFLINE_TEST\b.*\n?/m, "");
  working = stripPreviousSetupPatch(working);
  working = stripPreviousLoopPatch(working);
  return working;
}

// Compile-safety check that runs on the final .ino. Throws — rather than
// silently returning a broken file — when the codegen pipeline produced
// something that wouldn't compile.
export function validateGeneratedIno(ino: string): void {
  // 1. Duplicate function definitions (most fundamental — would refuse to link).
  const fnNames = new Set<string>();
  const fnPattern = /^[ \t]*(?:static\s+|inline\s+)*(?:void|int|float|bool|String|Animation|ColorSet|std::vector<[^>]+>)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/gm;
  for (const m of ino.matchAll(fnPattern)) {
    const name = m[1];
    if (!name) continue;
    if (fnNames.has(name)) {
      throw new Error(
        `Validation failed: function "${name}()" is defined more than once in the generated .ino. ` +
          "This would cause a redefinition compile error. Aborting export.",
      );
    }
    fnNames.add(name);
  }

  // 2. callback() body present and the MQTT marker block lives inside it.
  const callbackBody = findFunctionBody(
    ino,
    /void\s+callback\s*\(\s*char\s*\*[^)]*\)\s*\{/,
  );
  if (!callbackBody) {
    throw new Error("Validation failed: callback() body not found in the generated .ino.");
  }
  const mqttIdx = ino.indexOf(MQTT_START);
  if (mqttIdx >= 0) {
    if (mqttIdx < callbackBody.bodyStart || mqttIdx > callbackBody.bodyEnd) {
      throw new Error(
        "Validation failed: GENERATED MQTT BRANCHES block ended up outside callback(). " +
          "This would not compile (e.g., it would land inside struct LedRange / global scope). " +
          "Aborting export.",
      );
    }
  }
}

// Removes any prior online MQTT branches block.
export function removeOnlinePatches(base: string): string {
  let working = base;
  while (true) {
    const startIdx = working.indexOf(MQTT_START);
    if (startIdx < 0) break;
    const endIdx = working.indexOf(MQTT_END, startIdx);
    if (endIdx < 0) break;
    // Walk backwards to swallow the leading whitespace / comment indent.
    let cutStart = startIdx;
    while (cutStart > 0 && (working[cutStart - 1] === " " || working[cutStart - 1] === "\t")) {
      cutStart--;
    }
    if (cutStart > 0 && working[cutStart - 1] === "\n") cutStart--;
    working = working.slice(0, cutStart) + working.slice(endIdx + MQTT_END.length);
  }
  return working;
}
