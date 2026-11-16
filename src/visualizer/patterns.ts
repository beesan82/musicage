// The visualizer patterns (design spec §9.1, build 15): what answers the
// music on a stage, one pattern per stage at a time. A pattern is either a
// foot pattern, drawn in the band at the foot of the print area where the
// band meter has always stood, or a back pattern, a line drawing inside the
// print area above the texture and below the type.
//
// Which pattern a stage shows (§9.1 "舞台ごとの出し方", decided 2026-11-16):
// - the clock: always `bars`, the quiet default;
// - the nameplate: the song's pattern;
// - the lyric sheet: always `bars-bold` (no back pattern behind the body);
// - the synced stage: the song's pattern; a back pattern at 0.6 × its opacity
//   and never within LINE_CLEARANCE_PX of the line on stage.
// Until a song's pattern is chosen (selectPattern.ts) it is `bars`. A pattern
// without a renderer yet (build 15b fills them in, see registry.tsx) is drawn
// as `bars`.

/** Every pattern of the first set, the default first. */
export const VISUALIZER_KEYS = [
  'bars',
  'bars-bold',
  'wave',
  'ripple',
  'stipple',
  'curtain',
  'ring',
  'landscape',
] as const;

export type VisualizerKey = (typeof VISUALIZER_KEYS)[number];

/** Where a pattern draws: the band at the foot of the print area, or behind the type. */
export type VisualizerPlace = 'foot' | 'back';

export const VISUALIZER_PLACE: Readonly<Record<VisualizerKey, VisualizerPlace>> = {
  bars: 'foot',
  'bars-bold': 'foot',
  wave: 'foot',
  ripple: 'back',
  stipple: 'back',
  curtain: 'back',
  ring: 'back',
  landscape: 'back',
};

/** The clock's pattern, and every song's until its own is chosen. */
export const DEFAULT_PATTERN: VisualizerKey = 'bars';
/** The lyric sheet's pattern, whatever the song's (decided 2026-11-16). */
export const SHEET_PATTERN: VisualizerKey = 'bars-bold';
/** A back pattern on the synced stage is drawn at this share of its opacity. */
export const SYNCED_BACK_OPACITY_SCALE = 0.6;
/** A back pattern on the synced stage keeps this far outside the line's bounds, px. */
export const LINE_CLEARANCE_PX = 16;
/** The one crossfade from `bars` to the song's pattern, ms. */
export const PATTERN_CROSSFADE_MS = 1200;

export function isVisualizerKey(value: unknown): value is VisualizerKey {
  return typeof value === 'string' && (VISUALIZER_KEYS as readonly string[]).includes(value);
}

/** The stages a visualizer stands on. */
export type VisualizerStage = 'clock' | 'nameplate' | 'sheet' | 'synced';

/** The pattern a stage asks for, before any fallback for a pattern not drawn yet. */
export function stagePatternKey(stage: VisualizerStage, songPattern: VisualizerKey | null): VisualizerKey {
  switch (stage) {
    case 'clock':
      return DEFAULT_PATTERN;
    case 'sheet':
      return SHEET_PATTERN;
    case 'nameplate':
    case 'synced':
      return songPattern ?? DEFAULT_PATTERN;
  }
}

export interface StageVisualizerPlan {
  /** The pattern the stage asks for (what a song's choice says). */
  requested: VisualizerKey;
  /** The pattern drawn: `requested`, or `bars` while it has no renderer. */
  key: VisualizerKey;
  place: VisualizerPlace;
  /** Multiplies the pattern's own opacity (never above 1). */
  opacityScale: number;
  /** The pattern keeps clear of the line on stage (LINE_CLEARANCE_PX around its bounds). */
  clearsLine: boolean;
}

/**
 * What a stage draws: the stage's pattern (stagePatternKey), `bars` in its
 * place while it has no renderer (`drawable`), and on the synced stage a back
 * pattern dimmed and cut away around the line. Foot patterns everywhere keep
 * their own opacity and their place in the band.
 */
export function planStageVisualizer(
  stage: VisualizerStage,
  songPattern: VisualizerKey | null,
  drawable: (key: VisualizerKey) => boolean,
): StageVisualizerPlan {
  const requested = stagePatternKey(stage, songPattern);
  const key = drawable(requested) ? requested : DEFAULT_PATTERN;
  const place = VISUALIZER_PLACE[key];
  const behindLine = stage === 'synced' && place === 'back';
  return {
    requested,
    key,
    place,
    opacityScale: behindLine ? SYNCED_BACK_OPACITY_SCALE : 1,
    clearsLine: behindLine,
  };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The line's bounds grown by LINE_CLEARANCE_PX on every side: a back pattern draws nothing inside. */
export function lineClearance(bounds: Box, margin: number = LINE_CLEARANCE_PX): Box {
  return {
    x: bounds.x - margin,
    y: bounds.y - margin,
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2,
  };
}

/** Whether a point of a back pattern may be drawn: outside the clearance (always, without one). */
export function clearOfLine(clearance: Box | null, x: number, y: number): boolean {
  'worklet';
  if (clearance === null) return true;
  return (
    x < clearance.x ||
    x > clearance.x + clearance.width ||
    y < clearance.y ||
    y > clearance.y + clearance.height
  );
}

/** The incoming pattern's opacity share `elapsedMs` into the crossfade (0..1, linear). */
export function crossfadeIn(elapsedMs: number): number {
  'worklet';
  if (!(elapsedMs > 0)) return 0;
  return elapsedMs >= PATTERN_CROSSFADE_MS ? 1 : elapsedMs / PATTERN_CROSSFADE_MS;
}
