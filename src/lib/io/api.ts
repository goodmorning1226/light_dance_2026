import type {
  CustomAnimation,
  DanceProject,
  ProgramArrangement,
} from "@/types";
import { ImportError } from "./internal";
import {
  parseCustomAnimation,
  parseDanceProject,
  parseProgramArrangement,
} from "./parsers";

const JSON_INDENT = 2;

export function exportDanceToJson(danceProject: DanceProject): string {
  return JSON.stringify(danceProject, null, JSON_INDENT);
}

export function exportProgramToJson(programArrangement: ProgramArrangement): string {
  return JSON.stringify(programArrangement, null, JSON_INDENT);
}

export function exportCustomAnimationToJson(customAnimation: CustomAnimation): string {
  return JSON.stringify(customAnimation, null, JSON_INDENT);
}

export function importDanceFromJson(jsonText: string): DanceProject {
  const raw = parseJsonText(jsonText, "dance");
  return runImport(() => parseDanceProject(raw, ""), "Invalid dance file");
}

export function importProgramFromJson(jsonText: string): ProgramArrangement {
  const raw = parseJsonText(jsonText, "program");
  return runImport(() => parseProgramArrangement(raw, ""), "Invalid program file");
}

export function importCustomAnimationFromJson(jsonText: string): CustomAnimation {
  const raw = parseJsonText(jsonText, "custom animation");
  return runImport(() => parseCustomAnimation(raw, ""), "Invalid custom animation format");
}

function parseJsonText(jsonText: string, label: string): unknown {
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new ImportError("", `Invalid ${label} file: malformed JSON (${reason})`);
  }
}

function runImport<T>(parse: () => T, prefix: string): T {
  try {
    return parse();
  } catch (e) {
    if (e instanceof ImportError) {
      throw new ImportError(e.path, `${prefix}: ${e.bareMessage}`);
    }
    throw e;
  }
}
