import {
  sanitizeCppIdentifier,
  durationToCppExpression,
  dancerConditionToCpp,
  colorToCpp,
} from "@/lib/codegen";

console.log("=== sanitizeCppIdentifier ===");
for (const s of [
  "Sample Dance",
  "What Makes You Beautiful",
  "Shut Up & Dance",
  "什麼歌",
  "1abc",
  "",
  "_underscore",
  "Mix中Eng123",
  "  spaces  ",
]) {
  console.log(JSON.stringify(s).padEnd(32), "=>", JSON.stringify(sanitizeCppIdentifier(s)));
}

console.log("\n=== durationToCppExpression (BEAT_TIME_X) ===");
for (const d of [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 8, 0.3, 1.7, 0]) {
  console.log(String(d).padStart(6), "=>", durationToCppExpression(d, "BEAT_TIME_X"));
}

console.log("\n=== dancerConditionToCpp ===");
for (const arr of [[], [1], [1, 2, 3], [1, 2, 3, 4, 5, 6, 7]]) {
  console.log(JSON.stringify(arr).padEnd(22), "=>", dancerConditionToCpp(arr));
}

console.log("\n=== colorToCpp ===");
for (const c of [
  { r: 0, g: 0, b: 0 },
  { r: 255, g: 230, b: 25 },
  { r: 300, g: -5, b: 100.6 },
]) {
  console.log(JSON.stringify(c).padEnd(28), "=>", colorToCpp(c));
}
