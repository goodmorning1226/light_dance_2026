// Custom animation function signature is fixed in v1:
//   void <functionName>(const BodyPart& part, CRGB color, int duration)
// The code generator emits a direct blocking call:
//   <functionName>(<part>, CRGB(r,g,b), <durationExpression>);
//
// User-supplied cppCode is the full function definition; it must not redefine
// anything in the existing Animation library in light_dance_2026.ino.

export type CustomAnimationParamType = "BodyPart" | "CRGB" | "int" | "float";

export interface CustomAnimationParameter {
  name: string;
  type: CustomAnimationParamType;
  required: boolean;
  description?: string;
}

export interface CustomAnimation {
  schemaVersion: string;
  type: "led-animation";
  id: string;
  name: string;
  description: string;
  kind: "customCppFunction";
  functionName: string;
  cppCode: string;
  parameters: CustomAnimationParameter[];
}
