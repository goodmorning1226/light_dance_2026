// Optional side-effect hooks the storage layer fires AFTER a successful
// localStorage write. The CloudModeProvider installs handlers when the user
// enters Cloud Mode and removes them when they leave; existing call sites
// (`saveDance`, `saveProgram`, ...) need no change.
//
// The hooks fire-and-forget to keep localStorage writes synchronous; cloud
// errors are reported via the supplied `onError` callback so the UI can
// flash a "saving failed" badge without blocking the user's edit flow.
//
// Suppression: when realtime delivers a remote change, we apply it via the
// SAME storage functions (so existing pages re-read and re-render). Without
// suppression those writes would re-fire the cloud hooks and we'd push the
// remote change back as if it were our own — an infinite ping-pong. The
// `withSuppressedHooks` wrapper bumps a counter; a non-zero counter means
// "we are mid-apply, don't fire hooks."

import type {
  CustomAnimation,
  DanceProject,
  ExportSettings,
  ProgramArrangement,
} from "@/types";

export interface CloudMirrorHooks {
  onDanceSaved?: (dance: DanceProject) => void;
  onDanceDeleted?: (danceId: string) => void;
  onProgramSaved?: (program: ProgramArrangement) => void;
  onCustomAnimationSaved?: (animation: CustomAnimation) => void;
  onCustomAnimationDeleted?: (animationId: string) => void;
  onExportSettingsSaved?: (settings: ExportSettings) => void;
}

let activeHooks: CloudMirrorHooks = {};
let suppressionDepth = 0;

export function setCloudMirrorHooks(hooks: CloudMirrorHooks): void {
  activeHooks = hooks;
}

export function clearCloudMirrorHooks(): void {
  activeHooks = {};
}

export function getCloudMirrorHooks(): CloudMirrorHooks {
  if (suppressionDepth > 0) return {};
  return activeHooks;
}

// Run `fn` with all cloud-mirror hooks disabled. Reentrant — nested calls
// just keep the depth counter non-zero. Use this when applying realtime
// events so the resulting localStorage writes don't echo back to cloud.
export function withSuppressedHooks<T>(fn: () => T): T {
  suppressionDepth += 1;
  try {
    return fn();
  } finally {
    suppressionDepth -= 1;
  }
}
