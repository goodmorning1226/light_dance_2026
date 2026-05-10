import type { CustomAnimation, DanceAction, DanceProject } from "@/types";
import { isBuiltInAnimationId } from "@/types";

function walkActions(dance: DanceProject, visit: (a: DanceAction) => void): void {
  for (const section of dance.sections) {
    for (const step of section.steps) {
      for (const action of step.actions) {
        visit(action);
        if (action.subAnimations) {
          for (const sub of action.subAnimations) visit(sub);
        }
      }
    }
  }
}

// Returns the set of non-built-in animationIds referenced anywhere inside the
// dance's actions. Built-ins (ShowColor, LTR, ...) are skipped.
export function collectReferencedCustomIds(dance: DanceProject): Set<string> {
  const ids = new Set<string>();
  walkActions(dance, (a) => {
    if (a.type !== "animation") return;
    const id = a.animationId;
    if (id && !isBuiltInAnimationId(id)) ids.add(id);
  });
  return ids;
}

// Ensures every custom animation referenced by an action lives inside
// dance.customAnimations. Pulls missing ones from the registry. Idempotent.
export function ensureReferencedCustomsAttached(
  dance: DanceProject,
  registry: ReadonlyArray<CustomAnimation>,
): DanceProject {
  const referenced = collectReferencedCustomIds(dance);
  if (referenced.size === 0) return dance;
  const existingIds = new Set(dance.customAnimations.map((c) => c.id));
  const additions: CustomAnimation[] = [];
  for (const id of referenced) {
    if (existingIds.has(id)) continue;
    const found = registry.find((c) => c.id === id);
    if (found) additions.push(found);
  }
  if (additions.length === 0) return dance;
  return { ...dance, customAnimations: [...dance.customAnimations, ...additions] };
}

// Combine dance-attached customs + registry customs, dedup by id. dance-side
// wins (it's the snapshot frozen with the dance, which is what codegen uses).
export function mergeCustomAnimations(
  attached: ReadonlyArray<CustomAnimation>,
  registry: ReadonlyArray<CustomAnimation>,
): CustomAnimation[] {
  const seen = new Set(attached.map((c) => c.id));
  const merged: CustomAnimation[] = [...attached];
  for (const c of registry) {
    if (!seen.has(c.id)) {
      merged.push(c);
      seen.add(c.id);
    }
  }
  return merged;
}
