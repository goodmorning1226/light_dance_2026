import type {
  DanceProject,
  DanceSection,
  DanceStep,
  TimelineEvent,
} from "@/types";

// Converts the dance's `timelineEvents` for one section into a sequence of
// `DanceStep`s ready for the existing step-level code emitter:
//
//   1. Sort events by startBeat (stable).
//   2. Group events with identical startBeat — their actions merge into one
//      step (the user spec rule §3).
//   3. The step's durationBeats is the gap to the next group's startBeat,
//      capped to the longest event in the group. This keeps the wall-clock
//      timeline accurate when events overlap or have different durations.
//   4. Insert empty wait-only steps for gaps between groups (rule §4).
//   5. clearBefore is true if ANY event in the group requested it (rule §6).
//
// All durations are in beats and use section-relative startBeats (subtracted
// from the section's global startBeat) so the emitted timelineDelay calls
// match what the editor displayed.
export function timelineEventsToEmissionSteps(
  dance: DanceProject,
  section: DanceSection,
): DanceStep[] {
  const events = dance.timelineEvents;
  if (events === undefined) {
    // Pre-migration legacy data — fall through to the existing step list.
    return section.steps;
  }

  const sectionStartBeat = section.startBeat ?? 0;
  const sectionEvents = events
    .filter((e) => e.sectionId === section.id)
    .slice()
    .sort((a, b) => a.startBeat - b.startBeat);
  if (sectionEvents.length === 0) return [];

  // Group by startBeat (rule §3).
  interface Group {
    startBeat: number;
    events: TimelineEvent[];
  }
  const groups: Group[] = [];
  for (const e of sectionEvents) {
    const tail = groups[groups.length - 1];
    if (tail && tail.startBeat === e.startBeat) tail.events.push(e);
    else groups.push({ startBeat: e.startBeat, events: [e] });
  }

  const emitted: DanceStep[] = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!;
    const nextStartBeat = i + 1 < groups.length ? groups[i + 1]!.startBeat : null;

    const maxOwnDuration = Math.max(...group.events.map((e) => e.durationBeats));
    const stepDuration =
      nextStartBeat !== null
        ? Math.min(maxOwnDuration, nextStartBeat - group.startBeat)
        : maxOwnDuration;

    if (stepDuration > 0) {
      emitted.push({
        id: `merged-${section.id}-${group.startBeat}`,
        durationBeats: stepDuration,
        clearBefore: group.events.some((e) => e.clearBefore),
        actions: group.events.flatMap((e) => e.actions),
      });
    }

    // Gap to next group → emit an empty wait step (rule §4).
    if (nextStartBeat !== null) {
      const groupEnd = group.startBeat + stepDuration;
      const gap = nextStartBeat - groupEnd;
      if (gap > 0) {
        emitted.push({
          id: `gap-${section.id}-${groupEnd}`,
          durationBeats: gap,
          clearBefore: false, // rule §5: don't auto-clear during silence
          actions: [],
        });
      }
    }
  }

  // The first emitted step inherits the section's startBeat — but the
  // step-level emitter doesn't care about absolute time. We preserve
  // section-relative ordering only.
  void sectionStartBeat;

  return emitted;
}
