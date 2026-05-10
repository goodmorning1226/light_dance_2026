import { sampleDanceProject } from "@/data";
import {
  type KvStore,
  addDanceToProgram,
  deleteCustomAnimation,
  deleteDance,
  duplicateDance,
  duplicateProgramItem,
  getAllCustomAnimations,
  getAllDances,
  getCurrentDanceId,
  getDance,
  getProgram,
  removeDanceFromProgram,
  reorderProgramItems,
  saveCustomAnimation,
  saveDance,
  saveProgram,
  setCurrentDanceId,
  setStorageBackend,
  updateProgramItem,
} from "@/lib/storage";
import { createId } from "@/lib/storage";
import type { CustomAnimation, DanceProject } from "@/types";

class InMemoryBackend implements KvStore {
  store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  snapshot(): Map<string, string> {
    return new Map(this.store);
  }
}

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

function freshBackend(): InMemoryBackend {
  const b = new InMemoryBackend();
  setStorageBackend(b);
  return b;
}

function cloneDance(name: string, id: string): DanceProject {
  const next = JSON.parse(JSON.stringify(sampleDanceProject)) as DanceProject;
  next.id = id;
  next.name = name;
  return next;
}

console.log("\n=== Dances: CRUD ===");

{
  freshBackend();
  check("getAllDances starts empty", getAllDances().length === 0);
  check("getDance returns null for missing id", getDance("missing") === null);

  const a = cloneDance("Dance A", "dance-a");
  const b = cloneDance("Dance B", "dance-b");
  saveDance(a);
  saveDance(b);
  check("After two saves, list length is 2", getAllDances().length === 2);
  check("getDance returns the saved dance", getDance("dance-b")?.name === "Dance B");

  const renamed: DanceProject = { ...a, name: "Dance A renamed" };
  saveDance(renamed);
  check("Re-saving same id updates instead of duplicating", getAllDances().length === 2);
  check("Update is reflected on read", getDance("dance-a")?.name === "Dance A renamed");

  deleteDance("dance-a");
  check("deleteDance removes the entry", getDance("dance-a") === null);
  check("deleteDance keeps unrelated entries", getDance("dance-b")?.name === "Dance B");
}

console.log("\n=== Dances: duplicate ===");

{
  freshBackend();
  const original = cloneDance("Original", "dance-original");
  saveDance(original);
  const dup = duplicateDance("dance-original");

  check("duplicateDance returns a new id", dup.id !== original.id);
  check("duplicate name is suffixed", dup.name === "Original (copy)");
  check("duplicate persists into store", getAllDances().length === 2);

  const origSectionIds = original.sections.map((s) => s.id);
  const dupSectionIds = dup.sections.map((s) => s.id);
  check(
    "duplicate has fresh section ids",
    dupSectionIds.every((id, i) => id !== origSectionIds[i]),
  );
  const origStepIds = original.sections.flatMap((s) => s.steps.map((st) => st.id));
  const dupStepIds = dup.sections.flatMap((s) => s.steps.map((st) => st.id));
  check(
    "duplicate has fresh step ids",
    dupStepIds.every((id, i) => id !== origStepIds[i]),
  );
}

console.log("\n=== Current dance id ===");

{
  freshBackend();
  check("currentDanceId starts null", getCurrentDanceId() === null);
  setCurrentDanceId("dance-x");
  check("setCurrentDanceId persists", getCurrentDanceId() === "dance-x");
  setCurrentDanceId(null);
  check("setCurrentDanceId(null) clears", getCurrentDanceId() === null);

  const a = cloneDance("Dance A", "dance-a");
  saveDance(a);
  setCurrentDanceId("dance-a");
  deleteDance("dance-a");
  check("deleteDance clears currentDanceId when it matches", getCurrentDanceId() === null);
}

console.log("\n=== Program ===");

{
  freshBackend();
  const initial = getProgram();
  check("getProgram returns default when empty", initial.type === "led-program" && initial.items.length === 0);

  const danceA = cloneDance("Dance A", "dance-a");
  const danceB = cloneDance("Dance B", "dance-b");
  const danceC = cloneDance("Dance C", "dance-c");
  saveDance(danceA);
  saveDance(danceB);
  saveDance(danceC);

  const itemA = addDanceToProgram(danceA, "ON_OPENING");
  const itemB = addDanceToProgram(danceB, "ON_MAIN");
  const itemC = addDanceToProgram(danceC, "ON_FINAL");
  check("addDanceToProgram appends in order", getProgram().items.map((i) => i.id).join(",") === [itemA.id, itemB.id, itemC.id].join(","));

  updateProgramItem(itemB.id, { mqttCommand: "ON_BRIDGE" });
  check("updateProgramItem applies patch", getProgram().items.find((i) => i.id === itemB.id)?.mqttCommand === "ON_BRIDGE");

  reorderProgramItems(0, 2);
  check("reorderProgramItems moves source to target", getProgram().items.map((i) => i.id).join(",") === [itemB.id, itemC.id, itemA.id].join(","));

  removeDanceFromProgram(itemC.id);
  check("removeDanceFromProgram drops the item", getProgram().items.length === 2);

  const replacement = { ...getProgram(), name: "My Set" };
  saveProgram(replacement);
  check("saveProgram overwrites the whole arrangement", getProgram().name === "My Set");
}

console.log("\n=== Program: duplicateProgramItem ===");

{
  freshBackend();
  const a = cloneDance("Dance A", "dance-a");
  saveDance(a);
  const item = addDanceToProgram(a, "ON_OPENING");
  const dup = duplicateProgramItem(item.id);
  check("duplicateProgramItem returns a new item", dup !== null && dup.id !== item.id);
  check("duplicateProgramItem keeps the same danceId", dup?.danceId === item.danceId);
  check("duplicate appears in program", getProgram().items.length === 2);
  check("duplicate is inserted right after original", getProgram().items[1]?.id === dup?.id);
  check(
    "duplicateProgramItem returns null for missing id",
    duplicateProgramItem("missing") === null,
  );
}

console.log("\n=== saveDance auto-syncs ProgramItem.dance snapshots ===");

{
  freshBackend();
  const a = cloneDance("Dance A", "dance-a");
  saveDance(a);
  addDanceToProgram(a, "ON_A");
  addDanceToProgram(a, "ON_A_AGAIN");

  const updated: DanceProject = { ...a, name: "Dance A v2", bpm: 140 };
  saveDance(updated);

  const program = getProgram();
  check(
    "Both program items see the updated name",
    program.items.every((it) => it.dance?.name === "Dance A v2"),
  );
  check(
    "Both program items see the updated bpm",
    program.items.every((it) => it.dance?.bpm === 140),
  );

  // A save for an unrelated dance must not touch program items.
  const other = cloneDance("Other", "dance-other");
  saveDance(other);
  const program2 = getProgram();
  check(
    "Saving an unrelated dance leaves program items intact",
    program2.items.every((it) => it.danceId === "dance-a"),
  );
}

console.log("\n=== Custom animations ===");

{
  freshBackend();
  check("getAllCustomAnimations starts empty", getAllCustomAnimations().length === 0);

  const ca: CustomAnimation = {
    schemaVersion: "1.0",
    type: "led-animation",
    id: "ca-001",
    name: "Sparkle",
    description: "Random twinkles",
    kind: "customCppFunction",
    functionName: "customSparkle",
    cppCode: "void customSparkle(const BodyPart& p, CRGB c, int d) {}",
    parameters: [{ name: "p", type: "BodyPart", required: true }],
  };
  saveCustomAnimation(ca);
  check("saveCustomAnimation persists", getAllCustomAnimations().length === 1);

  const updated: CustomAnimation = { ...ca, name: "Sparkle v2" };
  saveCustomAnimation(updated);
  check("re-saving same id updates rather than appending", getAllCustomAnimations().length === 1);
  check("update is reflected on read", getAllCustomAnimations()[0]?.name === "Sparkle v2");

  deleteCustomAnimation(ca.id);
  check("deleteCustomAnimation removes the entry", getAllCustomAnimations().length === 0);
}

console.log("\n=== Persistence across simulated page refresh ===");

{
  const live = freshBackend();
  const dance = cloneDance("Persisted", "dance-persisted");
  saveDance(dance);
  setCurrentDanceId(dance.id);
  addDanceToProgram(dance, "ON_TEST");
  saveCustomAnimation({
    schemaVersion: "1.0",
    type: "led-animation",
    id: "ca-persisted",
    name: "Persisted CA",
    description: "",
    kind: "customCppFunction",
    functionName: "customPersist",
    cppCode: "void customPersist(const BodyPart& p, CRGB c, int d) {}",
    parameters: [],
  });

  // Simulate full page refresh: brand-new backend instance, populated with the
  // same persisted bytes. Same as the user closing and reopening the tab.
  const reloaded = new InMemoryBackend();
  reloaded.store = live.snapshot();
  setStorageBackend(reloaded);

  check("Dances survive refresh", getDance("dance-persisted")?.name === "Persisted");
  check("currentDanceId survives refresh", getCurrentDanceId() === "dance-persisted");
  check("Program items survive refresh", getProgram().items.length === 1);
  check("Custom animations survive refresh", getAllCustomAnimations().length === 1);
}

console.log("\n=== Corruption recovery ===");

{
  const live = freshBackend();
  live.setItem("ld26:dances", "not valid json");
  check("Corrupt dances key falls back to []", getAllDances().length === 0);

  live.setItem("ld26:dances", JSON.stringify([{ this: "is not a dance" }]));
  check("Invalid dance entry is dropped silently", getAllDances().length === 0);

  live.setItem("ld26:program", "not valid json");
  check("Corrupt program key falls back to default", getProgram().items.length === 0);
}

console.log("\n=== createId uniqueness ===");

{
  const ids = new Set<string>();
  for (let i = 0; i < 1000; i++) ids.add(createId("x"));
  check("createId generates 1000 unique ids", ids.size === 1000);
  check("createId honours the prefix", [...ids].every((id) => id.startsWith("x-")));
}

console.log(`\n${passes}/${passes + failures} passed${failures > 0 ? ` (${failures} failed)` : ""}`);
process.exit(failures > 0 ? 1 : 0);
