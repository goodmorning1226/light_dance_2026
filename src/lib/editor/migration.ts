import type { DanceProject, DanceSection, TimelineEvent } from "@/types";
import { createId } from "@/lib/storage";

// Walks a dance's `sections[].steps[]` and produces an authoritative
// `timelineEvents[]` with global startBeats accumulated across sections.
//
// Idempotent: when `timelineEvents` is already present, the dance is returned
// unchanged. This means re-running the migration on already-migrated data is
// safe, and editing freshly-migrated data won't drift back to step world.
//
// `section.startBeat` is filled in for every section so the editor's beat
// ruler can render section markers without re-deriving accumulators.
export function migrateStepsToTimelineEvents(dance: DanceProject): DanceProject {
  if (dance.timelineEvents !== undefined) return dance;

  const events: TimelineEvent[] = [];
  let cursor = 0;

  const sectionsWithStart: DanceSection[] = dance.sections.map((section) => {
    const sectionStartBeat = section.startBeat ?? cursor;
    let inSection = sectionStartBeat;
    for (const step of section.steps) {
      events.push({
        id: createId("evt"),
        sectionId: section.id,
        startBeat: inSection,
        durationBeats: step.durationBeats,
        clearBefore: step.clearBefore,
        actions: step.actions.map((a) => ({ ...a })),
      });
      inSection += step.durationBeats;
    }
    cursor = inSection;
    return { ...section, startBeat: sectionStartBeat };
  });

  return {
    ...dance,
    sections: sectionsWithStart,
    timelineEvents: events,
  };
}
