import type { DanceProject, Dancer, TimelineEvent } from "@/types";

export interface TimelineWarning {
  eventId?: string;
  message: string;
  severity: "warn" | "error";
}

// Snap a beat value to the editor's grid (e.g., 0.5 → quarter beat). Negative
// values clamp to 0; non-finite numbers fall back to 0.
export function snapBeat(value: number, beatUnit: number): number {
  if (!Number.isFinite(value)) return 0;
  if (beatUnit <= 0) return Math.max(0, value);
  const snapped = Math.round(value / beatUnit) * beatUnit;
  return Math.max(0, Number(snapped.toFixed(6)));
}

export function eventEndBeat(event: TimelineEvent): number {
  return event.startBeat + event.durationBeats;
}

// Total length of the dance in beats — the latest end-of-event across the
// whole timeline. Used to size the beat ruler and place section markers.
export function totalBeatsOf(dance: DanceProject): number {
  const events = dance.timelineEvents ?? [];
  let max = 0;
  for (const e of events) max = Math.max(max, eventEndBeat(e));
  // Also consider section.startBeat in case a section is declared past the
  // last event (empty section at the tail).
  for (const s of dance.sections) {
    if (s.startBeat !== undefined) max = Math.max(max, s.startBeat);
  }
  return max;
}

// Filter helpers used by the All/Dancer view modes.
export function eventsForDancer(events: ReadonlyArray<TimelineEvent>, dancerId: number): TimelineEvent[] {
  return events.filter((e) => e.actions.some((a) => a.dancers.includes(dancerId)));
}

export function eventsTouchingDancer(event: TimelineEvent, dancerId: number): boolean {
  return event.actions.some((a) => a.dancers.includes(dancerId));
}

// Returns events that overlap the given beat range [start, start+duration).
export function eventsActiveAtBeat(
  events: ReadonlyArray<TimelineEvent>,
  beat: number,
): TimelineEvent[] {
  return events.filter((e) => e.startBeat <= beat && eventEndBeat(e) > beat);
}

// All warnings the user might want to see in the editor. Severity "error" is
// for things the codegen will reject; "warn" is for likely-mistaken setups
// that still produce valid C++ (e.g., overlapping events).
export function collectTimelineWarnings(dance: DanceProject): TimelineWarning[] {
  const events = dance.timelineEvents ?? [];
  const warnings: TimelineWarning[] = [];

  // Per-event basics.
  for (const e of events) {
    if (e.durationBeats <= 0) {
      warnings.push({ eventId: e.id, severity: "error", message: `Event "${e.label ?? e.id}" has durationBeats <= 0.` });
    }
    if (e.startBeat < 0) {
      warnings.push({ eventId: e.id, severity: "error", message: `Event "${e.label ?? e.id}" has negative startBeat.` });
    }
    for (let i = 0; i < e.actions.length; i++) {
      const a = e.actions[i]!;
      if (a.dancers.length === 0) {
        warnings.push({
          eventId: e.id,
          severity: "warn",
          message: `Event "${e.label ?? e.id}" action #${i + 1} has no dancers selected.`,
        });
      }
      if (a.type === "static" && (!a.parts || a.parts.length === 0)) {
        warnings.push({
          eventId: e.id,
          severity: "warn",
          message: `Event "${e.label ?? e.id}" static action #${i + 1} has no body parts.`,
        });
      }
      if (a.type === "animation" && !a.part && a.animationId !== "Rainbow") {
        warnings.push({
          eventId: e.id,
          severity: "warn",
          message: `Event "${e.label ?? e.id}" animation action #${i + 1} has no part (Rainbow excepted).`,
        });
      }
    }
  }

  // Per-dancer overlap detection: same dancer in two events whose time ranges
  // intersect. This is a soft warning since the user might want this.
  const byDancer = new Map<number, TimelineEvent[]>();
  for (const e of events) {
    const dancers = new Set<number>();
    for (const a of e.actions) for (const d of a.dancers) dancers.add(d);
    for (const d of dancers) {
      if (!byDancer.has(d)) byDancer.set(d, []);
      byDancer.get(d)!.push(e);
    }
  }
  for (const [d, list] of byDancer.entries()) {
    const sorted = [...list].sort((a, b) => a.startBeat - b.startBeat);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      if (eventEndBeat(a) > b.startBeat) {
        warnings.push({
          eventId: b.id,
          severity: "warn",
          message:
            `Dancer ${d}: events "${a.label ?? a.id}" (${a.startBeat}→${eventEndBeat(a)}b) ` +
            `and "${b.label ?? b.id}" (${b.startBeat}→${eventEndBeat(b)}b) overlap.`,
        });
      }
    }
  }

  return warnings;
}

// Returns dancers in display order (numerically by id). Convenience for the
// timeline UI so dancer rows always render top-to-bottom in the same order.
export function orderedDancers(dance: DanceProject): Dancer[] {
  return [...dance.dancers].sort((a, b) => a.id - b.id);
}

// Pick the section a given beat belongs to: the section with the largest
// startBeat ≤ beat. Falls back to the first section, then to a sentinel id.
// Used to auto-assign sectionId when the user creates / moves an event so
// they never have to think about which section it lives in.
export function findSectionForBeat(dance: DanceProject, beat: number): string {
  if (dance.sections.length === 0) return "section-default";
  const sorted = [...dance.sections].sort(
    (a, b) => (a.startBeat ?? 0) - (b.startBeat ?? 0),
  );
  let chosen = sorted[0]!;
  for (const s of sorted) {
    if ((s.startBeat ?? 0) <= beat) chosen = s;
    else break;
  }
  return chosen.id;
}

// True if a candidate event range [startBeat, startBeat+durationBeats) would
// overlap any existing event already touching this dancer (excluding the
// event with `ignoreEventId`, used when re-validating an event being moved).
// Half-open intervals: an event ending at exactly startBeat is fine.
export function hasOverlapForDancer(
  events: ReadonlyArray<TimelineEvent>,
  dancerId: number,
  startBeat: number,
  durationBeats: number,
  ignoreEventId?: string,
): boolean {
  const end = startBeat + durationBeats;
  for (const e of events) {
    if (ignoreEventId && e.id === ignoreEventId) continue;
    if (!eventsTouchingDancer(e, dancerId)) continue;
    const eEnd = e.startBeat + e.durationBeats;
    if (e.startBeat < end && eEnd > startBeat) return true;
  }
  return false;
}
