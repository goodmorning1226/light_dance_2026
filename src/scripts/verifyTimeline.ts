import * as fs from "node:fs";
import * as path from "node:path";
import type { DanceProject, ProgramArrangement } from "@/types";
import { sampleDanceProject, sampleProgramArrangement } from "@/data";
import { migrateStepsToTimelineEvents } from "@/lib/editor/migration";
import {
  collectTimelineWarnings,
  eventsActiveAtBeat,
  eventsForDancer,
  snapBeat,
  totalBeatsOf,
} from "@/lib/editor/timelineHelpers";
import { generateFullOnlineMqttIno, generateDanceCpp } from "@/lib/codegen";

let passes = 0;
let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
    passes++;
  } else {
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
    failures++;
  }
}

console.log("\n=== migrateStepsToTimelineEvents ===");
{
  const migrated = migrateStepsToTimelineEvents(sampleDanceProject);
  const events = migrated.timelineEvents ?? [];

  check("migration produces timelineEvents array", Array.isArray(migrated.timelineEvents));
  // Sample dance has 2 sections × 2 steps each → 4 events
  check("event count matches total step count", events.length === 4);
  check("first event starts at beat 0", events[0]?.startBeat === 0);
  check("section ids are preserved", events.every((e) => migrated.sections.some((s) => s.id === e.sectionId)));

  // Section startBeats should accumulate
  const intro = migrated.sections[0]!;
  const chorus = migrated.sections[1]!;
  check("section[0].startBeat = 0", intro.startBeat === 0);
  // Intro = 2 + 4 = 6 beats; Chorus should start at 6
  check("section[1].startBeat = sum of preceding step durations", chorus.startBeat === 6);

  // Idempotency
  const again = migrateStepsToTimelineEvents(migrated);
  check("migrating an already-migrated dance is a no-op", again === migrated);

  // Timeline events from sample data
  const sortedStartBeats = [...events].map((e) => e.startBeat).sort((a, b) => a - b);
  check("events have monotonic-or-equal startBeats", sortedStartBeats.every((b, i) => i === 0 || b >= sortedStartBeats[i - 1]!));
}

console.log("\n=== timelineHelpers: snapBeat / totalBeatsOf / eventsForDancer ===");
{
  check("snapBeat 0.4 to 0.5 grid → 0.5", snapBeat(0.4, 0.5) === 0.5);
  check("snapBeat 0.6 to 0.5 grid → 0.5", snapBeat(0.6, 0.5) === 0.5);
  check("snapBeat 0.74 to 0.25 grid → 0.75", snapBeat(0.74, 0.25) === 0.75);
  check("snapBeat negative → 0", snapBeat(-3, 0.5) === 0);
  check("snapBeat NaN → 0", snapBeat(NaN, 0.5) === 0);

  const migrated = migrateStepsToTimelineEvents(sampleDanceProject);
  // Total beats = 2 + 4 + 2 + 2 = 10
  check("totalBeatsOf = 10", totalBeatsOf(migrated) === 10);

  const dancer1Events = eventsForDancer(migrated.timelineEvents ?? [], 1);
  const dancer4Events = eventsForDancer(migrated.timelineEvents ?? [], 4);
  check("eventsForDancer(1) finds events touching dancer 1", dancer1Events.length > 0);
  check("eventsForDancer(4) finds none (sample only uses 1/2/3)", dancer4Events.length === 0);

  // eventsActiveAtBeat
  const active0 = eventsActiveAtBeat(migrated.timelineEvents ?? [], 0);
  check("eventsActiveAtBeat(0) finds 1 event", active0.length === 1);
  const active5 = eventsActiveAtBeat(migrated.timelineEvents ?? [], 5);
  // beat 5 is inside intro-2 (starts 2, lasts 4 → 2..6)
  check("eventsActiveAtBeat(5) finds the Rainbow event", active5.some((e) => e.actions.some((a) => a.animationId === "Rainbow")));
}

console.log("\n=== Codegen: timelineEvents take precedence over steps ===");
{
  const migrated = migrateStepsToTimelineEvents(sampleDanceProject);
  const cppViaSteps = generateDanceCpp(sampleDanceProject, "online");
  const cppViaTimeline = generateDanceCpp(migrated, "online");
  // The two should produce the same C++ for sample data (timelineEvents was
  // derived from steps), modulo merged-step IDs in comments.
  const stripIds = (s: string) => s.replace(/Step (?:merged|gap|step)-[\w-]+/g, "Step ID");
  check(
    "step-based and timeline-based codegen produce equivalent C++ (modulo step ids)",
    stripIds(cppViaSteps) === stripIds(cppViaTimeline),
  );
}

console.log("\n=== Codegen: gap between events emits a wait step ===");
{
  const danceWithGap: DanceProject = {
    schemaVersion: 1,
    type: "led-dance",
    id: "dance-gap",
    name: "Gap Dance",
    bpm: 120,
    beatUnit: 0.5,
    dancers: [{ id: 1, name: "A" }],
    sections: [{ id: "s1", name: "Only", steps: [], startBeat: 0 }],
    customAnimations: [],
    timelineEvents: [
      {
        id: "e1",
        sectionId: "s1",
        startBeat: 0,
        durationBeats: 2,
        clearBefore: true,
        actions: [{ type: "static", dancers: [1], parts: ["whole"], color: { r: 255, g: 0, b: 0 } }],
      },
      {
        id: "e2",
        sectionId: "s1",
        startBeat: 6, // 4-beat gap after e1 ends (e1 ends at 2)
        durationBeats: 2,
        clearBefore: false,
        actions: [{ type: "static", dancers: [1], parts: ["whole"], color: { r: 0, g: 255, b: 0 } }],
      },
    ],
  };

  const cpp = generateDanceCpp(danceWithGap, "online");
  // Should have 3 emission steps: e1, gap, e2
  const stepCount = (cpp.match(/\/\/ Step /g) ?? []).length;
  check("3 emission steps emitted (event + gap + event)", stepCount === 3);
  // Gap step has no actions and just a timelineDelay
  check(
    "gap step has timelineDelay corresponding to 4 beats",
    /\/\/ Step gap-s1-2[\s\S]*?timelineDelay\(4 \* BEAT_TIME_GapDance\)/.test(cpp),
  );
}

console.log("\n=== Codegen: same-startBeat events merge into one step ===");
{
  const dance: DanceProject = {
    schemaVersion: 1,
    type: "led-dance",
    id: "dance-merge",
    name: "Merge Dance",
    bpm: 120,
    beatUnit: 0.5,
    dancers: [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ],
    sections: [{ id: "s1", name: "Only", steps: [], startBeat: 0 }],
    customAnimations: [],
    timelineEvents: [
      {
        id: "e1",
        sectionId: "s1",
        startBeat: 0,
        durationBeats: 2,
        clearBefore: true,
        actions: [{ type: "static", dancers: [1], parts: ["whole"], color: { r: 255, g: 0, b: 0 } }],
      },
      {
        id: "e2",
        sectionId: "s1",
        startBeat: 0, // same start as e1
        durationBeats: 2,
        clearBefore: false,
        actions: [{ type: "static", dancers: [2], parts: ["whole"], color: { r: 0, g: 255, b: 0 } }],
      },
    ],
  };

  const cpp = generateDanceCpp(dance, "online");
  const stepCount = (cpp.match(/\/\/ Step /g) ?? []).length;
  check("only 1 emission step for two events at startBeat 0", stepCount === 1);
  check("merged step contains BOTH dancer branches", /DANCER == 1/.test(cpp) && /DANCER == 2/.test(cpp));
  check("merged step uses clearBefore=true (any of the events)", cpp.includes("fill_solid(leds, NUM_LEDS, CRGB::Black);"));
}

console.log("\n=== Codegen: full .ino still works for migrated dance ===");
{
  const INO_PATH = path.join(process.cwd(), "light_dance_2026.ino");
  const BASE = fs.readFileSync(INO_PATH, "utf8");
  const migrated = migrateStepsToTimelineEvents(sampleDanceProject);
  const arrangementMigrated: ProgramArrangement = {
    ...sampleProgramArrangement,
    items: [
      { ...sampleProgramArrangement.items[0]!, dance: migrated },
    ],
  };
  // Should not throw and should produce valid output
  const ino = generateFullOnlineMqttIno(BASE, arrangementMigrated);
  check("full-online-mqtt .ino built from migrated dance", ino.includes("danceSampleDance();"));
  check("forward decl for the dance still emitted", ino.includes("void danceSampleDance();"));
}

console.log("\n=== Warnings ===");
{
  const dance: DanceProject = {
    schemaVersion: 1,
    type: "led-dance",
    id: "d",
    name: "D",
    bpm: 120,
    beatUnit: 0.5,
    dancers: [{ id: 1, name: "A" }],
    sections: [{ id: "s1", name: "S", steps: [], startBeat: 0 }],
    customAnimations: [],
    timelineEvents: [
      {
        id: "bad-zero",
        sectionId: "s1",
        startBeat: 0,
        durationBeats: 0, // error
        clearBefore: false,
        actions: [
          { type: "static", dancers: [], color: { r: 0, g: 0, b: 0 } }, // warn: no dancers, no parts
        ],
      },
      {
        id: "overlap-a",
        sectionId: "s1",
        startBeat: 4,
        durationBeats: 4,
        clearBefore: false,
        actions: [{ type: "static", dancers: [1], parts: ["whole"], color: { r: 255, g: 0, b: 0 } }],
      },
      {
        id: "overlap-b",
        sectionId: "s1",
        startBeat: 6, // overlaps overlap-a (ends at 8)
        durationBeats: 4,
        clearBefore: false,
        actions: [{ type: "static", dancers: [1], parts: ["whole"], color: { r: 0, g: 255, b: 0 } }],
      },
    ],
  };
  const warnings = collectTimelineWarnings(dance);
  check("durationBeats <= 0 produces error", warnings.some((w) => w.severity === "error" && w.message.includes("durationBeats <= 0")));
  check("empty dancers list produces warn", warnings.some((w) => w.severity === "warn" && w.message.includes("no dancers selected")));
  check("static action with no parts produces warn", warnings.some((w) => w.severity === "warn" && w.message.includes("no body parts")));
  check("overlapping events for the same dancer produce warn", warnings.some((w) => w.severity === "warn" && w.message.includes("overlap")));
}

console.log(`\n${passes}/${passes + failures} passed${failures > 0 ? ` (${failures} failed)` : ""}`);
process.exit(failures > 0 ? 1 : 0);
