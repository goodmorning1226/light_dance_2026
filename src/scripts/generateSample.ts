import { sampleDanceProject, sampleProgramArrangement } from "@/data";
import { generateDanceCpp, generateProgramCpp } from "@/lib/codegen";

function banner(title: string): void {
  console.log("\n" + "=".repeat(72));
  console.log(`  ${title}`);
  console.log("=".repeat(72) + "\n");
}

banner("Dance — ONLINE export (paste into light_dance_2026.ino)");
console.log(generateDanceCpp(sampleDanceProject, "online"));

banner("Dance — OFFLINE export");
console.log(generateDanceCpp(sampleDanceProject, "offline"));

banner("Program — ONLINE export");
console.log(generateProgramCpp(sampleProgramArrangement, "online"));

banner("Program — OFFLINE export");
console.log(generateProgramCpp(sampleProgramArrangement, "offline"));
