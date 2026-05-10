export { sanitizeCppIdentifier, dedupeIdentifiers } from "./sanitize";
export { computeDanceFunctionNames } from "./dance";
export {
  durationToCppExpression,
  colorToCpp,
  dancerConditionToCpp,
} from "./expressions";
export { generateStaticActionCpp, generateAnimationActionCpp } from "./actions";
export { generateCustomAnimationsCpp, detectMqttReferences } from "./customAnimations";
export { generateDanceCpp } from "./dance";
export { generateProgramCpp } from "./program";
export {
  generateSnippetCpp,
  generateFullOfflineIno,
  generateFullOnlineMqttIno,
  generateFullIno,
} from "./fullIno";
export {
  insertGeneratedCode,
  insertMqttBranches,
  patchSetupForOffline,
  patchLoopForOffline,
  findFunctionBody,
  validateGeneratedIno,
  CODE_START,
  CODE_END,
  FWD_START,
  FWD_END,
  MQTT_START,
  MQTT_END,
} from "./insertion";
