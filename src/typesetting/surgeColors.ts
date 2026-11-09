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

// The ink's body (visual overhaul spec §3c.1): each glyph is filled with a
// slight top-to-bottom gradient, lit on top and shaded at the foot, like ink
// taken up by paper under one lamp. Amplitudes are "the print's take", not a
// metallic sheen; stage G may lower them to 0.08 / 0.06.

/** How far the top of an ink glyph leans toward the lamp colour. */
export const INK_BODY_LIGHT = 0.12;
/** How far the foot of an ink glyph leans toward the background. */
export const INK_BODY_SHADE = 0.1;
/** How far the top of an accent glyph leans toward the high accent. */
export const ACCENT_BODY_HIGH = 0.3;
/** How far a context line's ink leans toward the lamp colour (its half-shadow). */
export const CONTEXT_INK_LIGHT = 0.3;

/** Gradient stops of the gradient's start (glyph top) and end (glyph foot), in glyph sizes from the baseline. */
export const BODY_TOP = -0.88;
export const BODY_FOOT = 0.12;

/** The ink body's gradient colours, top then foot. */
export function inkBody(ink: string, light: string, background: string): string[] {
  'worklet';
  return [
    interpolateColor(INK_BODY_LIGHT, [0, 1], [ink, light]),
    interpolateColor(INK_BODY_SHADE, [0, 1], [ink, background]),
  ];
}

/** The accent body's gradient colours, top then foot. */
export function accentBody(accent: string, accentHigh: string): string[] {
  'worklet';
  return [interpolateColor(ACCENT_BODY_HIGH, [0, 1], [accent, accentHigh]), accent];
}

/** The ink of a context line: the ink mixed toward the lamp colour. */
export function contextInk(ink: string, light: string): string {
  'worklet';
  return interpolateColor(CONTEXT_INK_LIGHT, [0, 1], [ink, light]);
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
