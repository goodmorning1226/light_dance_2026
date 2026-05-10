import {
  type BodyPartName,
  type BuiltInAnimationId,
  type ColorRGB,
  type CustomAnimation,
  type CustomAnimationParameter,
  type CustomAnimationParamType,
  type DanceAction,
  type Dancer,
  type DanceProject,
  type DanceSection,
  type DanceStep,
  type ProgramArrangement,
  type ProgramItem,
  isBodyPartName,
  isBuiltInAnimationId,
} from "@/types";
import {
  ImportError,
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asString,
  joinPath,
  requireField,
} from "./internal";

const VALID_PARAM_TYPES: CustomAnimationParamType[] = [
  "BodyPart",
  "CRGB",
  "int",
  "float",
];

function asBodyPartName(v: unknown, path: string): BodyPartName {
  const s = asString(v, path);
  if (!isBodyPartName(s)) {
    throw new ImportError(path, `Unknown body part "${s}"`);
  }
  return s;
}

function asAnimationId(
  v: unknown,
  path: string,
  customAnimIds: ReadonlySet<string>,
): BuiltInAnimationId | string {
  const s = asString(v, path);
  if (isBuiltInAnimationId(s)) return s;
  if (customAnimIds.has(s)) return s;
  throw new ImportError(
    path,
    `Unknown animationId "${s}" — not a built-in animation and not declared in customAnimations`,
  );
}

function asActionType(v: unknown, path: string): "static" | "animation" {
  const s = asString(v, path);
  if (s === "static" || s === "animation") return s;
  throw new ImportError(path, `Expected "static" or "animation", got "${s}"`);
}

function parseColor(raw: unknown, path: string): ColorRGB {
  const obj = asObject(raw, path);
  const r = requireField(obj, "r", path, asNumber);
  const g = requireField(obj, "g", path, asNumber);
  const b = requireField(obj, "b", path, asNumber);
  for (const [name, val] of [["r", r], ["g", g], ["b", b]] as const) {
    if (val < 0 || val > 255) {
      throw new ImportError(joinPath(path, name), `Color channel out of range 0..255 (got ${val})`);
    }
  }
  return { r, g, b };
}

function parseDancer(raw: unknown, path: string): Dancer {
  const obj = asObject(raw, path);
  const id = requireField(obj, "id", path, asNumber);
  const name = requireField(obj, "name", path, asString);
  return { id, name };
}

function parseDanceAction(
  raw: unknown,
  path: string,
  customAnimIds: ReadonlySet<string>,
): DanceAction {
  const obj = asObject(raw, path);
  const type = requireField(obj, "type", path, asActionType);
  const dancers = requireField(obj, "dancers", path, (v, p) => {
    const arr = asArray(v, p);
    return arr.map((d, i) => asNumber(d, `${p}[${i}]`));
  });
  const color = requireField(obj, "color", path, parseColor);

  const action: DanceAction = { type, dancers, color };

  if (obj.parts !== undefined) {
    const partsPath = joinPath(path, "parts");
    const arr = asArray(obj.parts, partsPath);
    action.parts = arr.map((p, i) => asBodyPartName(p, `${partsPath}[${i}]`));
  }
  if (obj.part !== undefined) {
    action.part = asBodyPartName(obj.part, joinPath(path, "part"));
  }
  if (obj.animationId !== undefined) {
    action.animationId = asAnimationId(obj.animationId, joinPath(path, "animationId"), customAnimIds);
  }

  if (obj.subAnimations !== undefined) {
    if (type === "static") {
      throw new ImportError(
        joinPath(path, "subAnimations"),
        `static action cannot have subAnimations`,
      );
    }
    const subPath = joinPath(path, "subAnimations");
    const arr = asArray(obj.subAnimations, subPath);
    action.subAnimations = arr.map((s, i) => {
      const subActionPath = `${subPath}[${i}]`;
      const sub = parseDanceAction(s, subActionPath, customAnimIds);
      if (sub.type !== "animation") {
        throw new ImportError(
          joinPath(subActionPath, "type"),
          `subAnimations entry must have type "animation", got "${sub.type}"`,
        );
      }
      return sub;
    });
  }

  if (type === "animation" && (action.animationId === "Multi" || action.animationId === "Sequential")) {
    if (!action.subAnimations || action.subAnimations.length === 0) {
      throw new ImportError(
        joinPath(path, "subAnimations"),
        `Multi / Sequential animation requires non-empty subAnimations.`,
      );
    }
  }

  return action;
}

function parseDanceStep(
  raw: unknown,
  path: string,
  customAnimIds: ReadonlySet<string>,
): DanceStep {
  const obj = asObject(raw, path);
  const id = requireField(obj, "id", path, asString);
  const durationBeats = requireField(obj, "durationBeats", path, asNumber);
  if (durationBeats <= 0) {
    throw new ImportError(
      joinPath(path, "durationBeats"),
      `durationBeats must be > 0 (got ${durationBeats})`,
    );
  }
  const clearBefore = requireField(obj, "clearBefore", path, asBoolean);
  const actionsRaw = requireField(obj, "actions", path, asArray);
  const actionsPath = joinPath(path, "actions");
  const actions = actionsRaw.map((a, i) =>
    parseDanceAction(a, `${actionsPath}[${i}]`, customAnimIds),
  );
  return { id, durationBeats, clearBefore, actions };
}

function parseDanceSection(
  raw: unknown,
  path: string,
  customAnimIds: ReadonlySet<string>,
): DanceSection {
  const obj = asObject(raw, path);
  const id = requireField(obj, "id", path, asString);
  const name = requireField(obj, "name", path, asString);
  const stepsRaw = requireField(obj, "steps", path, asArray);
  const stepsPath = joinPath(path, "steps");
  const steps = stepsRaw.map((s, i) => parseDanceStep(s, `${stepsPath}[${i}]`, customAnimIds));
  const out: DanceSection = { id, name, steps };
  if (obj.startBeat !== undefined) {
    const sb = asNumber(obj.startBeat, joinPath(path, "startBeat"));
    if (sb < 0) {
      throw new ImportError(joinPath(path, "startBeat"), `startBeat must be >= 0 (got ${sb})`);
    }
    out.startBeat = sb;
  }
  return out;
}

function parseTimelineEvent(
  raw: unknown,
  path: string,
  customAnimIds: ReadonlySet<string>,
  knownSectionIds: ReadonlySet<string>,
): import("@/types").TimelineEvent {
  const obj = asObject(raw, path);
  const id = requireField(obj, "id", path, asString);
  const sectionId = requireField(obj, "sectionId", path, asString);
  if (!knownSectionIds.has(sectionId)) {
    throw new ImportError(
      joinPath(path, "sectionId"),
      `sectionId "${sectionId}" does not match any section in the dance.`,
    );
  }
  const startBeat = requireField(obj, "startBeat", path, asNumber);
  if (startBeat < 0) {
    throw new ImportError(joinPath(path, "startBeat"), `startBeat must be >= 0 (got ${startBeat})`);
  }
  const durationBeats = requireField(obj, "durationBeats", path, asNumber);
  if (durationBeats <= 0) {
    throw new ImportError(
      joinPath(path, "durationBeats"),
      `durationBeats must be > 0 (got ${durationBeats})`,
    );
  }
  const clearBefore = requireField(obj, "clearBefore", path, asBoolean);
  const actionsRaw = requireField(obj, "actions", path, asArray);
  const actionsPath = joinPath(path, "actions");
  const actions = actionsRaw.map((a, i) =>
    parseDanceAction(a, `${actionsPath}[${i}]`, customAnimIds),
  );
  const out: import("@/types").TimelineEvent = {
    id,
    sectionId,
    startBeat,
    durationBeats,
    clearBefore,
    actions,
  };
  if (obj.label !== undefined) out.label = asString(obj.label, joinPath(path, "label"));
  if (obj.note !== undefined) out.note = asString(obj.note, joinPath(path, "note"));
  if (obj.lockedDancerId !== undefined) {
    out.lockedDancerId = asNumber(obj.lockedDancerId, joinPath(path, "lockedDancerId"));
  }
  return out;
}

function parseCustomAnimationParameter(
  raw: unknown,
  path: string,
): CustomAnimationParameter {
  const obj = asObject(raw, path);
  const name = requireField(obj, "name", path, asString);
  if (name.length === 0) {
    throw new ImportError(joinPath(path, "name"), `parameter name cannot be empty`);
  }
  const type = requireField(obj, "type", path, (v, p) => {
    const s = asString(v, p);
    if (!(VALID_PARAM_TYPES as string[]).includes(s)) {
      throw new ImportError(
        p,
        `Unknown parameter type "${s}" (expected one of ${VALID_PARAM_TYPES.join(", ")})`,
      );
    }
    return s as CustomAnimationParamType;
  });
  const required = requireField(obj, "required", path, asBoolean);
  const param: CustomAnimationParameter = { name, type, required };
  if (obj.description !== undefined) {
    param.description = asString(obj.description, joinPath(path, "description"));
  }
  return param;
}

export function parseCustomAnimation(raw: unknown, path: string): CustomAnimation {
  const obj = asObject(raw, path);

  // Discriminators first so a wrong-file import fails with a clear message.
  const type = requireField(obj, "type", path, asString);
  if (type !== "led-animation") {
    throw new ImportError(
      joinPath(path, "type"),
      `Expected type "led-animation", got "${type}"`,
    );
  }
  const kind = requireField(obj, "kind", path, asString);
  if (kind !== "customCppFunction") {
    throw new ImportError(
      joinPath(path, "kind"),
      `Expected kind "customCppFunction", got "${kind}"`,
    );
  }

  const schemaVersion = requireField(obj, "schemaVersion", path, asString);
  const id = requireField(obj, "id", path, asString);
  const name = requireField(obj, "name", path, asString);
  const description = requireField(obj, "description", path, asString);

  const functionName = requireField(obj, "functionName", path, asString);
  if (functionName.length === 0) {
    throw new ImportError(joinPath(path, "functionName"), `functionName cannot be empty`);
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(functionName)) {
    throw new ImportError(
      joinPath(path, "functionName"),
      `functionName "${functionName}" is not a valid C++ identifier`,
    );
  }

  const cppCode = requireField(obj, "cppCode", path, asString);
  if (cppCode.length === 0) {
    throw new ImportError(joinPath(path, "cppCode"), `cppCode cannot be empty`);
  }

  const paramsRaw = requireField(obj, "parameters", path, asArray);
  const paramsPath = joinPath(path, "parameters");
  const parameters = paramsRaw.map((p, i) =>
    parseCustomAnimationParameter(p, `${paramsPath}[${i}]`),
  );

  return {
    schemaVersion,
    type: "led-animation",
    id,
    name,
    description,
    kind: "customCppFunction",
    functionName,
    cppCode,
    parameters,
  };
}

export function parseDanceProject(raw: unknown, path: string): DanceProject {
  const obj = asObject(raw, path);

  const type = requireField(obj, "type", path, asString);
  if (type !== "led-dance") {
    throw new ImportError(joinPath(path, "type"), `Expected type "led-dance", got "${type}"`);
  }

  const schemaVersion = requireField(obj, "schemaVersion", path, asNumber);
  const id = requireField(obj, "id", path, asString);
  const name = requireField(obj, "name", path, asString);
  const bpm = requireField(obj, "bpm", path, asNumber);
  if (bpm <= 0) {
    throw new ImportError(joinPath(path, "bpm"), `bpm must be > 0 (got ${bpm})`);
  }
  const beatUnit = requireField(obj, "beatUnit", path, asNumber);
  if (beatUnit <= 0) {
    throw new ImportError(joinPath(path, "beatUnit"), `beatUnit must be > 0 (got ${beatUnit})`);
  }

  const dancersRaw = requireField(obj, "dancers", path, asArray);
  const dancersPath = joinPath(path, "dancers");
  const dancers = dancersRaw.map((d, i) => parseDancer(d, `${dancersPath}[${i}]`));

  const customAnimsRaw = requireField(obj, "customAnimations", path, asArray);
  const customAnimsPath = joinPath(path, "customAnimations");
  const customAnimations = customAnimsRaw.map((c, i) =>
    parseCustomAnimation(c, `${customAnimsPath}[${i}]`),
  );

  // Build the customAnimIds set BEFORE validating sections so animationId
  // cross-references inside actions can resolve.
  const customAnimIds = new Set(customAnimations.map((c) => c.id));

  const sectionsRaw = requireField(obj, "sections", path, asArray);
  const sectionsPath = joinPath(path, "sections");
  const sections = sectionsRaw.map((s, i) =>
    parseDanceSection(s, `${sectionsPath}[${i}]`, customAnimIds),
  );

  const result: DanceProject = {
    schemaVersion,
    type: "led-dance",
    id,
    name,
    bpm,
    beatUnit,
    dancers,
    sections,
    customAnimations,
  };

  if (obj.timelineEvents !== undefined) {
    const eventsRaw = asArray(obj.timelineEvents, joinPath(path, "timelineEvents"));
    const eventsPath = joinPath(path, "timelineEvents");
    const knownSectionIds = new Set(sections.map((s) => s.id));
    result.timelineEvents = eventsRaw.map((e, i) =>
      parseTimelineEvent(e, `${eventsPath}[${i}]`, customAnimIds, knownSectionIds),
    );
  }

  return result;
}

export function parseProgramItem(raw: unknown, path: string): ProgramItem {
  const obj = asObject(raw, path);
  const id = requireField(obj, "id", path, asString);
  const danceId = requireField(obj, "danceId", path, asString);
  const mqttCommand = requireField(obj, "mqttCommand", path, asString);

  const item: ProgramItem = { id, danceId, mqttCommand };
  if (obj.dance !== undefined) {
    const dancePath = joinPath(path, "dance");
    const dance = parseDanceProject(obj.dance, dancePath);
    if (dance.id !== danceId) {
      throw new ImportError(
        joinPath(dancePath, "id"),
        `Embedded dance.id "${dance.id}" does not match danceId "${danceId}"`,
      );
    }
    item.dance = dance;
  }
  return item;
}

export function parseProgramArrangement(raw: unknown, path: string): ProgramArrangement {
  const obj = asObject(raw, path);

  const type = requireField(obj, "type", path, asString);
  if (type !== "led-program") {
    throw new ImportError(joinPath(path, "type"), `Expected type "led-program", got "${type}"`);
  }

  const schemaVersion = requireField(obj, "schemaVersion", path, asNumber);
  const id = requireField(obj, "id", path, asString);
  const name = requireField(obj, "name", path, asString);

  const itemsRaw = requireField(obj, "items", path, asArray);
  const itemsPath = joinPath(path, "items");
  const items = itemsRaw.map((it, i) => parseProgramItem(it, `${itemsPath}[${i}]`));

  return {
    schemaVersion,
    type: "led-program",
    id,
    name,
    items,
  };
}
