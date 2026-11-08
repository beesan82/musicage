import { interpolateColor } from 'react-native-reanimated';

import { INK_TINT_MAX, surgeHighHex } from '../direction/surge';
import type { Palette } from '../direction/types';

// The stage's side of a surge (design spec §4 and §5, 2026-11-07): the
// palette's ink and accent move continuously with the surge strength, and the
// emphasized glyphs may glow on beat heads while the surge lasts.

/** Blur radius of the beat-head glow at full surge on a fresh beat head. Spec §5 caps it at 10 px. */
export const GLOW_RADIUS_MAX_PX = 8;
/** Opacity of the glow twin at full surge on a fresh beat head. */
export const GLOW_OPACITY_MAX = 0.9;
/** Spec §5: the glow is for the emphasized glyphs only, at most three. */
export const GLOW_MAX_GLYPHS = 3;

function clamp01(v: number): number {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The ink at surge strength `surge`: the palette's ink, with at most
 * INK_TINT_MAX of the high accent mixed in. Outside a surge it is the
 * palette's own string, untouched.
 */
export function surgeInk(palette: Palette, surge: number): string {
  'worklet';
  if (surge <= 0) return palette.ink;
  return interpolateColor(clamp01(surge) * INK_TINT_MAX, [0, 1], [palette.ink, surgeHighHex(palette)]);
}

/** The accent at surge strength `surge`: from the accent to the high accent. */
export function surgeAccent(palette: Palette, surge: number): string {
  'worklet';
  if (surge <= 0) return palette.accent;
  return interpolateColor(clamp01(surge), [0, 1], [palette.accent, surgeHighHex(palette)]);
}

/**
 * How much the glow shows, 0..1: the beat pulse (a one-off decay from each
 * beat head, never a steady light) scaled by the surge strength (0 outside a
 * surge, so ordinary passages never glow) and quartered while the beat is
 * not trusted, like every other beat-driven motion.
 */
export function glowAmount(pulse: number, surge: number, confidence: number): number {
  'worklet';
  const damp = confidence < 0.5 ? 0.25 : 1;
  return clamp01(pulse) * clamp01(surge) * damp;
}

export function glowRadiusPx(amount: number): number {
  'worklet';
  return GLOW_RADIUS_MAX_PX * clamp01(amount);
}

export function glowOpacity(amount: number): number {
  'worklet';
  return GLOW_OPACITY_MAX * clamp01(amount);
}
