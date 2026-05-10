import type { DanceAction } from "./dance";

// A single positioned event on the dance's global beat timeline. Events from
// every dancer share the same beat coordinate space, so two events at
// startBeat=4 happen simultaneously regardless of which dancer they target.
//
// `sectionId` groups events for navigation / labeling but does NOT affect
// playback timing (events are sorted globally by startBeat at codegen time).
//
// `lockedDancerId` marks a "personal" event created via the per-dancer
// `+ Event` button on the timeline label column: when set, the editor hides
// the dancer-selection UI and forces every action's `dancers` to be exactly
// `[lockedDancerId]`. "Common" events (created via the top-level button with
// a multi-dancer picker) leave this field undefined.
export interface TimelineEvent {
  id: string;
  sectionId: string;
  startBeat: number;
  durationBeats: number;
  clearBefore: boolean;
  actions: DanceAction[];
  label?: string;
  note?: string;
  lockedDancerId?: number;
}
