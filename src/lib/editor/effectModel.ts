import type {
  BodyPartName,
  ColorRGB,
  DanceAction,
  EffectConfig,
  TimelineEvent,
} from "@/types";

// One sub-step produced by expanding an Effect Action. Both the preview and
// the C++ codegen run through this same shape, so the timeline visualisation
// the user sees and the .ino they flash always agree on what the effect
// actually does.
export interface ExpandedEffectStep {
  // Beat offset within the parent event, [0, totalBeats).
  startBeatOffset: number;
  durationBeats: number;
  // Whether this sub-step prefixes a fill_solid(... Black) when emitted.
  clearBefore: boolean;
  // Plain `static` actions ready to feed into the existing step renderer +
  // codegen. Effect actions never appear in here.
  actions: DanceAction[];
}

interface Defaults {
  /** Fallback color when EffectConfig.colors is unset. Comes from the parent
   *  DanceAction.color so the user can author the colour in the same input
   *  as static / animation actions. */
  fallbackColor: ColorRGB;
  /** Fallback body parts when the effect doesn't override per-step. Comes
   *  from the parent DanceAction.parts (or [part]). */
  fallbackBodyParts: BodyPartName[];
  /** Pool of dancers available — comes from parent DanceAction.dancers. */
  dancers: number[];
}

const BLACK: ColorRGB = { r: 0, g: 0, b: 0 };

// Compute the ordered dancer sequence for wave / chase effects. orderMode
// reads off the effect; "custom" filters customOrder to dancers in the
// pool so a stale id doesn't crash later code.
export function orderedDancersFor(
  effect: EffectConfig,
  pool: ReadonlyArray<number>,
): number[] {
  const inPool = (id: number) => pool.includes(id);
  switch (effect.orderMode ?? "in-order") {
    case "custom":
      return (effect.customOrder ?? []).filter(inPool);
    case "reverse":
      return [...pool].sort((a, b) => b - a);
    case "in-order":
    default:
      return [...pool].sort((a, b) => a - b);
  }
}

function pickColor(
  colors: ReadonlyArray<ColorRGB> | undefined,
  fallback: ColorRGB,
  index: number,
): ColorRGB {
  if (!colors || colors.length === 0) return fallback;
  return colors[index % colors.length] ?? fallback;
}

function clampPositive(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

// The single source of truth for "what does this effect actually look like".
// Returns a list of sub-steps that, played back-to-back, sum to
// `totalBeats`. Empty list ⇒ malformed effect (caller should fall back to a
// no-op so playback doesn't stall).
export function expandEffectAction(
  effect: EffectConfig,
  totalBeats: number,
  defaults: Defaults,
): ExpandedEffectStep[] {
  if (!Number.isFinite(totalBeats) || totalBeats <= 0) return [];
  switch (effect.effectType) {
    case "global-switch":
      return expandGlobalSwitch(effect, totalBeats, defaults);
    case "dancer-wave":
      return expandDancerWave(effect, totalBeats, defaults);
    case "group-sequence":
      return expandGroupSequence(effect, totalBeats, defaults);
    case "fast-part-chase":
      return expandFastPartChase(effect, totalBeats, defaults);
    case "strobe":
      return expandStrobe(effect, totalBeats, defaults);
    default:
      return [];
  }
}

// ───────────────────────────── global-switch ─────────────────────────────
// Single sub-step covering the whole event. The parent action's dancers,
// parts, and color get applied as-is — global-switch is essentially the
// "snapshot" effect, useful for wholesale colour changes that the user
// wants to author as a single timeline block.
function expandGlobalSwitch(
  effect: EffectConfig,
  totalBeats: number,
  d: Defaults,
): ExpandedEffectStep[] {
  if (d.dancers.length === 0 || d.fallbackBodyParts.length === 0) return [];
  return [
    {
      startBeatOffset: 0,
      durationBeats: totalBeats,
      clearBefore: effect.clearBeforeStep ?? true,
      actions: [
        {
          type: "static",
          dancers: [...d.dancers],
          parts: [...d.fallbackBodyParts],
          color: d.fallbackColor,
        },
      ],
    },
  ];
}

// ───────────────────────────── dancer-wave ───────────────────────────────
// Each ordered dancer takes one slice of total / N. mode picks how the
// already-fired dancers behave on subsequent slices.
function expandDancerWave(
  effect: EffectConfig,
  totalBeats: number,
  d: Defaults,
): ExpandedEffectStep[] {
  const ordered = orderedDancersFor(effect, d.dancers);
  if (ordered.length === 0 || d.fallbackBodyParts.length === 0) return [];

  const stepDur = totalBeats / ordered.length;
  const mode = effect.mode ?? "one-by-one";
  const clearBefore = effect.clearBeforeStep ?? true;

  return ordered.map((dancerId, i) => {
    const activeIds =
      mode === "accumulate" ? ordered.slice(0, i + 1) : [dancerId];
    const color = pickColor(effect.colors, d.fallbackColor, i);
    return {
      startBeatOffset: i * stepDur,
      durationBeats: stepDur,
      // Accumulate mode shouldn't clear (would erase previous dancers); the
      // explicit clearBeforeStep override is respected for power users.
      clearBefore: mode === "accumulate" ? false : clearBefore,
      actions: [
        {
          type: "static",
          dancers: activeIds,
          parts: [...d.fallbackBodyParts],
          color,
        },
      ],
    };
  });
}

// ───────────────────────────── group-sequence ────────────────────────────
// Each entry in dancerGroups lights together for one slice of total / G.
function expandGroupSequence(
  effect: EffectConfig,
  totalBeats: number,
  d: Defaults,
): ExpandedEffectStep[] {
  const groups = (effect.dancerGroups ?? []).filter((g) => g.length > 0);
  if (groups.length === 0 || d.fallbackBodyParts.length === 0) return [];

  const stepDur = totalBeats / groups.length;
  const clearBefore = effect.clearBeforeStep ?? true;

  return groups.map((group, i) => {
    const color = pickColor(effect.colors, d.fallbackColor, i);
    return {
      startBeatOffset: i * stepDur,
      durationBeats: stepDur,
      clearBefore,
      actions: [
        {
          type: "static",
          dancers: [...group],
          parts: [...d.fallbackBodyParts],
          color,
        },
      ],
    };
  });
}

// ─────────────────────────── fast-part-chase ─────────────────────────────
// Same shape as dancer-wave but conventionally targets a small body part
// (hat, hands…) so visually it reads as a "chasing dot" between dancers.
// We keep the implementation identical and let the user pick the body
// part — saves them learning a separate effect.
function expandFastPartChase(
  effect: EffectConfig,
  totalBeats: number,
  d: Defaults,
): ExpandedEffectStep[] {
  const ordered = orderedDancersFor(effect, d.dancers);
  if (ordered.length === 0 || d.fallbackBodyParts.length === 0) return [];

  const stepDur = totalBeats / ordered.length;
  const clearBefore = effect.clearBeforeStep ?? true;

  return ordered.map((dancerId, i) => {
    const color = pickColor(effect.colors, d.fallbackColor, i);
    return {
      startBeatOffset: i * stepDur,
      durationBeats: stepDur,
      clearBefore,
      actions: [
        {
          type: "static",
          dancers: [dancerId],
          parts: [...d.fallbackBodyParts],
          color,
        },
      ],
    };
  });
}

// ───────────────────────────────── strobe ────────────────────────────────
// blinkCount cycles inside totalBeats. Each cycle splits onRatio:offRatio
// into an ON sub-step (paint colour) and an OFF sub-step (paint Black).
function expandStrobe(
  effect: EffectConfig,
  totalBeats: number,
  d: Defaults,
): ExpandedEffectStep[] {
  if (d.dancers.length === 0 || d.fallbackBodyParts.length === 0) return [];

  const blinks = Math.max(1, Math.floor(clampPositive(effect.blinkCount, 4)));
  const onRatio = clampPositive(effect.onRatio, 0.5);
  const offRatio = clampPositive(effect.offRatio, 0.5);
  const cycleDur = totalBeats / blinks;
  const onDur = cycleDur * (onRatio / (onRatio + offRatio));
  const offDur = cycleDur - onDur;
  const clearBefore = effect.clearBeforeStep ?? false;

  const out: ExpandedEffectStep[] = [];
  for (let i = 0; i < blinks; i++) {
    const cycleStart = i * cycleDur;
    const color = pickColor(effect.colors, d.fallbackColor, i);
    if (onDur > 0) {
      out.push({
        startBeatOffset: cycleStart,
        durationBeats: onDur,
        clearBefore,
        actions: [
          {
            type: "static",
            dancers: [...d.dancers],
            parts: [...d.fallbackBodyParts],
            color,
          },
        ],
      });
    }
    if (offDur > 0) {
      out.push({
        startBeatOffset: cycleStart + onDur,
        durationBeats: offDur,
        clearBefore: false,
        actions: [
          {
            type: "static",
            dancers: [...d.dancers],
            parts: [...d.fallbackBodyParts],
            color: BLACK,
          },
        ],
      });
    }
  }
  return out;
}

// ───────────────────────── helpers consumed elsewhere ────────────────────
// Convenience: pull the per-action defaults out of a DanceAction so callers
// don't have to dance around `parts` vs `part` themselves.
export function effectDefaultsFromAction(action: DanceAction): Defaults {
  const fallbackBodyParts: BodyPartName[] =
    action.parts ?? (action.part ? [action.part] : []);
  return {
    fallbackColor: action.color,
    fallbackBodyParts,
    dancers: action.dancers,
  };
}

// Resolve which simple actions should fire AT a given beat offset within
// `event`. Effect actions are expanded and the active sub-step's actions
// surface; static / animation actions pass through unchanged. Used by the
// preview to decide which LEDs are lit at the current playhead.
export function resolveActiveActionsAtBeat(
  event: TimelineEvent,
  beatOffsetWithinEvent: number,
): DanceAction[] {
  const out: DanceAction[] = [];
  for (const action of event.actions) {
    if (action.type !== "effect" || !action.effect) {
      out.push(action);
      continue;
    }
    const expanded = expandEffectAction(
      action.effect,
      event.durationBeats,
      effectDefaultsFromAction(action),
    );
    for (const sub of expanded) {
      const subEnd = sub.startBeatOffset + sub.durationBeats;
      if (sub.startBeatOffset <= beatOffsetWithinEvent && beatOffsetWithinEvent < subEnd) {
        out.push(...sub.actions);
        break;
      }
    }
  }
  return out;
}

// Convert a single TimelineEvent into one or more "virtual events" suitable
// for the existing emission-step builder. Events without an effect action
// pass through untouched. Events with an effect action become N back-to-back
// virtual events covering the same span. Used by codegen — see
// timelineEmission.ts.
export function expandEventToVirtualEvents(event: TimelineEvent): TimelineEvent[] {
  const effectAction = event.actions.find((a) => a.type === "effect" && a.effect);
  if (!effectAction) return [event];

  const otherActions = event.actions.filter((a) => a !== effectAction);
  const expanded = expandEffectAction(
    effectAction.effect as EffectConfig,
    event.durationBeats,
    effectDefaultsFromAction(effectAction),
  );
  if (expanded.length === 0) {
    // Malformed effect — fall back to the event with effect stripped, so the
    // user still sees the timeline slot occupied (with whatever other
    // actions they had).
    if (otherActions.length === 0) return [];
    return [{ ...event, actions: otherActions }];
  }

  return expanded.map((sub, i): TimelineEvent => ({
    ...event,
    id: `${event.id}-fx${i}`,
    startBeat: event.startBeat + sub.startBeatOffset,
    durationBeats: sub.durationBeats,
    // First sub-step inherits the parent event's clearBefore; subsequent
    // sub-steps use the effect's per-step decision. Other (non-effect)
    // actions ride along with the first sub-step only — putting them on
    // every sub-step would re-paint over the effect's per-step targets and
    // also trip the codegen's per-dancer uniqueness check.
    clearBefore: i === 0 ? event.clearBefore || sub.clearBefore : sub.clearBefore,
    actions: i === 0 ? [...otherActions, ...sub.actions] : sub.actions,
  }));
}
