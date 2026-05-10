import type { ProgramArrangement } from "@/types";
import { sampleDanceProject } from "./sampleDanceProject";

export const sampleProgramArrangement: ProgramArrangement = {
  schemaVersion: 1,
  type: "led-program",
  id: "program-sample-001",
  name: "Sample Program",
  items: [
    {
      id: "program-item-001",
      danceId: sampleDanceProject.id,
      mqttCommand: "ON_OPENING",
      dance: sampleDanceProject,
    },
  ],
};
