import type { CustomAnimation, ExportMode } from "@/types";

// Detect MQTT references; offline export does not initialise WiFi/MQTT, so
// `client.*` calls inside a custom animation will crash at runtime.
const MQTT_REFERENCE = /\bclient\s*\.|\bsetup_wifi\s*\(|\breconnect\s*\(/;

export function detectMqttReferences(cppCode: string): boolean {
  return MQTT_REFERENCE.test(cppCode);
}

export function generateCustomAnimationsCpp(
  customAnimations: ReadonlyArray<CustomAnimation>,
  exportMode: ExportMode = "online",
): string {
  const seenIds = new Set<string>();
  const seenFnNames = new Set<string>();
  const blocks: string[] = [];

  for (const anim of customAnimations) {
    if (seenIds.has(anim.id)) continue;
    if (seenFnNames.has(anim.functionName)) {
      throw new Error(
        `Custom animation function name "${anim.functionName}" is reused (id="${anim.id}"). ` +
          `Function names must be unique across the program.`,
      );
    }
    seenIds.add(anim.id);
    seenFnNames.add(anim.functionName);

    const headerLines: (string | null)[] = [
      `// Custom animation: ${anim.name}`,
      `//   id: ${anim.id}`,
      anim.description ? `//   ${anim.description}` : null,
    ];
    if (exportMode === "offline" && detectMqttReferences(anim.cppCode)) {
      headerLines.push(
        `// ⚠️ WARNING: this cppCode references client.* / setup_wifi / reconnect.`,
        `//    Offline export does not initialise MQTT — these calls may fail at runtime.`,
      );
    }
    const header = headerLines.filter((l): l is string => l !== null).join("\n");
    blocks.push(`${header}\n${anim.cppCode}`);
  }

  return blocks.join("\n\n");
}
